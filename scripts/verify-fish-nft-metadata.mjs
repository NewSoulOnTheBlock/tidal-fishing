import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../public/nft/fish/metadata/manifest.json', import.meta.url), 'utf8'));
if (manifest.collectionSize !== 500) throw new Error(`Expected collectionSize 500, got ${manifest.collectionSize}`);
if (manifest.tokens.length !== 500) throw new Error(`Expected 500 manifest tokens, got ${manifest.tokens.length}`);
if (manifest.speciesCount < 70) throw new Error(`Expected at least 70 gameplay fish species, got ${manifest.speciesCount}`);
const ranks = new Set(manifest.tokens.map((t) => t.rarityRank));
if (ranks.size !== 500) throw new Error(`Expected 500 unique rarity ranks, got ${ranks.size}`);
console.log(`ok ${manifest.collectionSize} ${manifest.speciesCount} ${manifest.tokens.length}`);
