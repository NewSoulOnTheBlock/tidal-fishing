import { deployment } from '../web3/deployment.js';
export class LpsUI {
  constructor(root = document.getElementById('screen-lps')) { this.root = root; }
  render(data = {}) {
    if (!this.root) return;
    const vault = deployment.houseReserveVault;
    this.root.innerHTML = `<section class="panel"><h2>LP / House Reserve</h2><p>LPs take counterparty risk and earn a disclosed share of house edge; this is not fixed yield.</p><p>Vault: ${vault || 'Not deployed yet'}</p><p>TVL: ${data.tvl ?? 'No verified reserve deposits yet.'}</p></section>`;
  }
}
