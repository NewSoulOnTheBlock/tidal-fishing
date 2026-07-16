import { NFT_HUNT } from '../config/economyConfig.js';

export function shouldCreateOpportunity({ verifiedCatchCount, hasActiveOpportunity }) {
  if (!NFT_HUNT.enabled || hasActiveOpportunity) return false;
  const count = Number(verifiedCatchCount || 0);
  if (count <= 0) return false;
  if (count === NFT_HUNT.firstOpportunityAfterCatches) return true;
  return count > NFT_HUNT.firstOpportunityAfterCatches && count % NFT_HUNT.catchesPerOpportunity === 0;
}

export function tokenEntryForId(manifest, tokenId) {
  return manifest?.tokens?.find((token) => Number(token.tokenId) === Number(tokenId)) || null;
}

export function nextUnassignedTokenIdFromRows(rows, collectionSize = NFT_HUNT.collectionSize) {
  const used = new Set((rows || []).map((row) => Number(row.token_id ?? row.tokenId)).filter(Number.isFinite));
  for (let tokenId = 1; tokenId <= collectionSize; tokenId += 1) {
    if (!used.has(tokenId)) return tokenId;
  }
  return null;
}

export async function getActiveOpportunity(pool, wallet) {
  const { rows } = await pool.query(
    `SELECT * FROM nft_mint_opportunities
     WHERE wallet_address=$1 AND status IN ('active','eligible')
     ORDER BY id DESC LIMIT 1`,
    [wallet],
  );
  return rows[0] || null;
}

export async function nextUnassignedTokenId(pool) {
  const { rows } = await pool.query('SELECT token_id FROM nft_mint_opportunities ORDER BY token_id ASC');
  return nextUnassignedTokenIdFromRows(rows, NFT_HUNT.collectionSize);
}

export function applyCatchToOpportunity({ opportunity, speciesId, now = Date.now() }) {
  if (!opportunity || opportunity.status !== 'active') return opportunity || null;

  const expiresAt = opportunity.expires_at ? new Date(opportunity.expires_at).getTime() : null;
  if (expiresAt && expiresAt < now) return { ...opportunity, status: 'expired' };

  if (opportunity.target_species_id === speciesId) {
    return { ...opportunity, status: 'eligible' };
  }

  const catches = Number(opportunity.catches_after_trigger || 0) + 1;
  const status = catches >= NFT_HUNT.opportunityExpiresAfterCatches ? 'expired' : 'active';
  return { ...opportunity, catches_after_trigger: catches, status };
}

export async function createOpportunityIfDue({ pool, wallet, verifiedCatchCount, manifest }) {
  const active = await getActiveOpportunity(pool, wallet);
  if (!shouldCreateOpportunity({ verifiedCatchCount, hasActiveOpportunity: !!active })) return null;

  const tokenId = await nextUnassignedTokenId(pool);
  if (!tokenId) return null;

  const token = tokenEntryForId(manifest, tokenId);
  if (!token) throw new Error(`No NFT manifest token ${tokenId}`);

  const expiresAt = new Date(Date.now() + NFT_HUNT.opportunityExpiresAfterMs);
  const { rows } = await pool.query(
    `INSERT INTO nft_mint_opportunities
      (wallet_address, token_id, target_species_id, trigger_catch_count, expires_at)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [wallet, tokenId, token.speciesId, verifiedCatchCount, expiresAt],
  );
  return rows[0] || null;
}
