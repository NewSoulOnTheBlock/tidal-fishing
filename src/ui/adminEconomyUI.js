import { apiFetch } from '../utils/api.js';
export class AdminEconomyUI {
  constructor(root = document.getElementById('screen-admin-economy')) { this.root = root; }
  async load(secret) {
    const headers = {};
    if (secret) headers.authorization = ['Bearer', secret].join(' ');
    const res = await apiFetch('/api/admin/economy', { headers, timeoutMs: 10000 });
    if (!res.ok) throw new Error('Admin economy endpoint unavailable');
    return res.json();
  }
  render(metrics = {}) {
    if (!this.root) return;
    this.root.innerHTML = `<section class="panel"><h2>Economy Health</h2><p>Bait sales gross: ${metrics.baitSalesGross ?? 'No verified purchases yet.'}</p><p>Rewards earned: ${metrics.rewardsEarned ?? 0}</p><p>Pending liabilities: ${metrics.pendingLiabilities ?? 0}</p><p>Actual house edge: ${metrics.actualHouseEdgeBps ?? '—'} bps</p></section>`;
  }
}
