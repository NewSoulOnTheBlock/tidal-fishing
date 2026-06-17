// Headless smoke test against any URL (defaults to local preview).
//
//   node smoke.mjs                          # http://localhost:8643/
//   node smoke.mjs https://tidal-...vercel.app/
import puppeteer from 'puppeteer';

const URL = process.argv[2] ?? 'http://localhost:8643/';

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();

const errors = [];
const warnings = [];
page.on('console', (msg) => {
  const text = msg.text();
  const url = msg.location()?.url ?? '';
  if (msg.type() === 'error') errors.push(`[console.error] ${text} (at ${url})`);
  else if (msg.type() === 'warning') warnings.push(`[console.warn] ${text}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => {
  if (req.url().endsWith('/favicon.ico')) return;
  errors.push(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});
page.on('response', (resp) => {
  if (resp.status() >= 400 && !resp.url().endsWith('/favicon.ico')) {
    errors.push(`[response ${resp.status()}] ${resp.url()}`);
  }
});

console.log(`smoking ${URL} …`);
try {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30_000 });
} catch (e) {
  errors.push(`[goto] ${e.message}`);
}

await new Promise((r) => setTimeout(r, 3000));

const probe = await page.evaluate(() => {
  const t = window.TIDAL;
  if (!t) return { ok: false, why: 'window.TIDAL not exposed' };

  let hudMoneyText = null;
  let shopMoneyText = null;
  let shopBuyText = null;
  let mapUnlockText = null;
  let burnButtonHidden = null;
  try {
    t.machine.set('IDLE');
    hudMoneyText = document.getElementById('hud-money')?.textContent;
    t.machine.set('SHOP');
    shopMoneyText = document.getElementById('shop-money')?.textContent;
    shopBuyText = document.querySelector('.btn-buy')?.textContent;
    burnButtonHidden = !document.querySelector('.btn-onchain');
    t.machine.set('IDLE');
    t.machine.set('MAP');
    mapUnlockText = document.querySelector('#map-grid .btn-buy')?.textContent;
    t.machine.set('IDLE');
  } catch (e) {
    return { ok: false, why: `state drive failed: ${e.message}` };
  }

  return {
    ok: true,
    phase: t.machine.current,
    money: t.S.profile.money,
    walletPanelVisible: !!document.getElementById('wallet-panel'),
    title: document.querySelector('.game-title')?.textContent,
    walletButtonText: document.querySelector('.wallet-connect')?.textContent ?? null,
    hudMoneyText,
    shopMoneyText,
    shopBuyText,
    mapUnlockText,
    burnButtonHiddenWithoutMint: burnButtonHidden,
  };
});

await browser.close();

console.log('--- probe ---');
console.log(JSON.stringify(probe, null, 2));
if (warnings.length) {
  console.log(`--- warnings (${warnings.length}) ---`);
  warnings.forEach((w) => console.log(w));
}
if (errors.length) {
  console.log(`--- errors (${errors.length}) ---`);
  errors.forEach((e) => console.log(e));
  process.exit(1);
} else {
  console.log('OK — no errors');
}
