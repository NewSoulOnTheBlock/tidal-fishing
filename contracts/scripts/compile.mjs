import { readFileSync } from 'node:fs';
import solc from 'solc';
const names=['Common.sol','BaitStore.sol','RewardEscrow.sol','TournamentVault.sol','SponsoredHotspots.sol','HouseReserveVault.sol'];
const sources=Object.fromEntries(names.map(n=>[`contracts/${n}`,{content:readFileSync(new URL(`../contracts/${n}`, import.meta.url),'utf8')} ]));
const input={language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const out=JSON.parse(solc.compile(JSON.stringify(input))); const errors=(out.errors||[]).filter(e=>e.severity==='error'); if(errors.length){ console.error(errors); process.exit(1); } console.log('Compiled', Object.values(out.contracts).flatMap(Object.keys).join(', '));
