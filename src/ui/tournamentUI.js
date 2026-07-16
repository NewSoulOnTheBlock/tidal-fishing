import { deployment } from '../web3/deployment.js';
export class TournamentUI {
  constructor(root = document.getElementById('screen-tournaments')) { this.root = root; }
  render(tournaments = []) {
    if (!this.root) return;
    this.root.innerHTML = `<section class="panel"><h2>Tournaments</h2><p>Entry fees split into prize pool, operator treasury, reserve, and sponsor/jackpot. Not guaranteed profit.</p><p>Vault: ${deployment.tournamentVault || 'Not deployed yet'}</p>${tournaments.length ? '' : '<p>No active tournaments.</p>'}</section>`;
  }
}
