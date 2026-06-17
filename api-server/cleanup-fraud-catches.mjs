// Remediation: purge fraudulent (unreachable-species) catches and repair ledgers.
//
// A catch is fraudulent when its species cannot legitimately be caught at the
// recorded location — i.e. the species is absent from the catalog, has an empty
// spawn map (a "fantasy" legendary that exists in no spawn table), or the
// recorded location is not one of the species' spawn locations. This is the
// SAME reachability rule the live /api/player/catch endpoint now enforces, so
// this only removes catches that could never have happened in honest play.
//
// Ledger repair is a DECREMENT (not a recompute from scratch): total_earned
// also grows from login-streak rewards, so we subtract exactly the fraudulent
// value/count rather than overwrite the totals. Journal rows are recomputed
// from the surviving catches for each affected (player, species) pair.
//
// USAGE:
//   node cleanup-fraud-catches.mjs            # dry run — reports only, no writes
//   node cleanup-fraud-catches.mjs --apply    # execute the cleanup in a tx
//
// Requires DATABASE_URL (same env the server uses). Safe to run repeatedly.

import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

dotenv.config();

const APPLY = process.argv.includes('--apply');
const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(readFileSync(join(__dirname, 'fishValues.json'), 'utf8'));
const SPECIES = CATALOG.species || {};

// A catch is reachable iff the species exists in the catalog AND its spawn map
// contains the recorded location. Everything else is fraudulent.
function isReachable(speciesId, location) {
  const spec = SPECIES[speciesId];
  if (!spec || !spec.spawn) return false;
  return Object.prototype.hasOwnProperty.call(spec.spawn, location);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Export it (or use a .env file) and retry.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log(`🧹 Fraudulent-catch cleanup — ${APPLY ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}\n`);

  // Pull every catch (minimal columns) and classify in JS against the catalog.
  const all = await pool.query(
    `SELECT c.id, c.player_id, c.species_id, c.location, c.value,
            p.wallet_address
       FROM catches c
       JOIN players p ON p.id = c.player_id`
  );

  const fraud = all.rows.filter((r) => !isReachable(r.species_id, r.location));
  console.log(`Scanned ${all.rows.length} catches — found ${fraud.length} fraudulent.\n`);

  if (fraud.length === 0) {
    console.log('✅ Nothing to clean.');
    return;
  }

  // Aggregate for the report + the ledger decrements.
  const byWallet = new Map();   // wallet -> { count, value, playerId }
  const bySpecies = new Map();  // species -> { count, value }
  const perPlayer = new Map();  // playerId -> { count, value }
  const affectedPairs = new Set(); // `${playerId}::${speciesId}`
  const fraudIds = [];

  for (const r of fraud) {
    fraudIds.push(r.id);
    const v = Number(r.value) || 0;

    const w = byWallet.get(r.wallet_address) || { count: 0, value: 0, playerId: r.player_id };
    w.count++; w.value += v; byWallet.set(r.wallet_address, w);

    const s = bySpecies.get(r.species_id) || { count: 0, value: 0 };
    s.count++; s.value += v; bySpecies.set(r.species_id, s);

    const pp = perPlayer.get(r.player_id) || { count: 0, value: 0 };
    pp.count++; pp.value += v; perPlayer.set(r.player_id, pp);

    affectedPairs.add(`${r.player_id}::${r.species_id}`);
  }

  console.log('By species:');
  for (const [sp, { count, value }] of [...bySpecies.entries()].sort((a, b) => b[1].value - a[1].value)) {
    console.log(`  ${sp.padEnd(20)} ${String(count).padStart(5)} catches  ${value.toLocaleString()} $TIDE`);
  }
  console.log('\nBy wallet:');
  for (const [wallet, { count, value }] of [...byWallet.entries()].sort((a, b) => b[1].value - a[1].value)) {
    console.log(`  ${wallet}  ${String(count).padStart(5)} catches  ${value.toLocaleString()} $TIDE`);
  }
  const totalValue = fraud.reduce((a, r) => a + (Number(r.value) || 0), 0);
  console.log(`\nTotal: ${fraud.length} catches across ${byWallet.size} wallet(s), ${totalValue.toLocaleString()} $TIDE to claw back.`);

  if (!APPLY) {
    console.log('\nℹ️  Dry run — no changes made. Re-run with --apply to execute.');
    return;
  }

  // Execute the cleanup atomically.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Decrement each affected player's ledger by exactly the fraudulent
    //    sum/count (floored at 0). Preserves legit login-streak earnings.
    for (const [playerId, { count, value }] of perPlayer.entries()) {
      await client.query(
        `UPDATE players
            SET total_earned  = GREATEST(0, total_earned  - $2),
                total_catches = GREATEST(0, total_catches - $3)
          WHERE id = $1`,
        [playerId, value, count]
      );
    }

    // 2) Delete the fraudulent catch rows (chunked to keep parameter lists sane).
    let deleted = 0;
    for (let i = 0; i < fraudIds.length; i += 1000) {
      const chunk = fraudIds.slice(i, i + 1000);
      const r = await client.query('DELETE FROM catches WHERE id = ANY($1)', [chunk]);
      deleted += r.rowCount;
    }

    // 3) Recompute journal entries from the SURVIVING catches for each affected
    //    (player, species) pair — removing inflated records the fraud created.
    let journalUpdated = 0;
    let journalDeleted = 0;
    for (const key of affectedPairs) {
      const [playerId, speciesId] = key.split('::');
      const surv = await client.query(
        `SELECT COUNT(*)::int AS n,
                MAX(size_cm)   AS ms,
                MAX(weight_kg) AS mw
           FROM catches
          WHERE player_id = $1 AND species_id = $2`,
        [playerId, speciesId]
      );
      const { n, ms, mw } = surv.rows[0];
      if (n === 0) {
        const r = await client.query(
          'DELETE FROM journal_entries WHERE player_id = $1 AND species_id = $2',
          [playerId, speciesId]
        );
        journalDeleted += r.rowCount;
      } else {
        const r = await client.query(
          `UPDATE journal_entries
              SET total_caught = $3, biggest_size_cm = $4, biggest_weight_kg = $5
            WHERE player_id = $1 AND species_id = $2`,
          [playerId, speciesId, n, ms, mw]
        );
        journalUpdated += r.rowCount;
      }
    }

    await client.query('COMMIT');
    console.log(`\n✅ Applied: deleted ${deleted} catches, decremented ${perPlayer.size} ledger(s), ` +
      `journal: ${journalUpdated} updated / ${journalDeleted} removed.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Cleanup failed — rolled back. No changes made.');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
