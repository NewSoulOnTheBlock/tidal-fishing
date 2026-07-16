import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FISH_SPECIES } from '../src/data/fishData.js';
import { buildFishNftCollection } from './fish-nft-metadata-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const metadataDir = new URL('../public/nft/fish/metadata/', import.meta.url);
const sharedManifest = new URL('../shared/fish-nft-manifest.json', import.meta.url);
const collectionSize = Number(process.env.FISH_NFT_COLLECTION_SIZE || 500);

const collection = buildFishNftCollection({ species: FISH_SPECIES, collectionSize });
collection.manifest.generatedAt = new Date().toISOString();

await mkdir(metadataDir, { recursive: true });
await mkdir(new URL('../shared/', import.meta.url), { recursive: true });

for (let i = 0; i < collection.metadata.length; i += 1) {
  const tokenId = i + 1;
  await writeFile(new URL(`${tokenId}.json`, metadataDir), `${JSON.stringify(collection.metadata[i], null, 2)}\n`);
}

const manifestJson = `${JSON.stringify(collection.manifest, null, 2)}\n`;
await writeFile(new URL('manifest.json', metadataDir), manifestJson);
await writeFile(sharedManifest, manifestJson);

console.log(`Generated ${collection.manifest.collectionSize} Fish NFT metadata files from ${collection.manifest.speciesCount} species`);
