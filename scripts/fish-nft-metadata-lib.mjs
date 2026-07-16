const BASE_RARITY_POINTS = Object.freeze({
  common: 100,
  uncommon: 180,
  rare: 320,
  epic: 550,
  legendary: 900,
  mythic: 1400,
  ultramythic: 2200,
});

const MUTATIONS = Object.freeze([
  ['none', 0, 7000],
  ['albino', 120, 1100],
  ['golden', 220, 800],
  ['obsidian', 260, 550],
  ['prismatic', 420, 350],
  ['ancient', 600, 200],
]);

const AURAS = Object.freeze([
  ['none', 0, 6200],
  ['tide', 50, 1400],
  ['storm', 90, 1000],
  ['lunar', 130, 700],
  ['solar', 170, 450],
  ['abyssal', 240, 250],
]);

const SIZE_CLASSES = Object.freeze([
  ['Fingerling', 0.1, 1400],
  ['Keeper', 0.35, 4000],
  ['Trophy', 0.7, 3000],
  ['Leviathan', 1.0, 1600],
]);

const WEIGHT_CLASSES = Object.freeze([
  ['Light', 0.15, 1800],
  ['Solid', 0.4, 4200],
  ['Heavy', 0.72, 2800],
  ['Record Mass', 1.0, 1200],
]);

const VISUAL_VARIANTS = Object.freeze(['Classic', 'Deepwater', 'Sunlit', 'Moonlit', 'Stormwake', 'Royal']);
const TEMPERAMENTS = Object.freeze(['Calm', 'Wild', 'Aggressive', 'Ancient', 'Trickster', 'Sovereign']);

export function hashInt(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function weightedPick(entries, seed) {
  const total = entries.reduce((sum, entry) => sum + entry[2], 0);
  let roll = seed % total;
  for (const entry of entries) {
    roll -= entry[2];
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

function rarityOrder(species) {
  const order = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
    ultramythic: 6,
  };
  return order[species?.rarity] ?? 0;
}

function speciesWeight(species) {
  return Math.max(1, 10 - rarityOrder(species) * 1.25);
}

function buildSpeciesPool(species) {
  const pool = [];
  for (const fish of species) {
    const count = Math.max(1, Math.round(speciesWeight(fish) * 3));
    for (let i = 0; i < count; i += 1) pool.push(fish);
  }
  return pool;
}

export function imageForSpecies(species) {
  if (species?.look?.image) return species.look.image;
  return `/nft/fish/images/${species.id}.svg`;
}

export function rarityScoreForToken({ species, editionNumber, mutation, aura, sizeClass, weightClass }) {
  const base = BASE_RARITY_POINTS[species.rarity] || 100;
  const mutationBonus = MUTATIONS.find((m) => m[0] === mutation)?.[1] || 0;
  const auraBonus = AURAS.find((a) => a[0] === aura)?.[1] || 0;
  const sizeBonus = Math.round((SIZE_CLASSES.find((s) => s[0] === sizeClass)?.[1] || 0) * 150);
  const weightBonus = Math.round((WEIGHT_CLASSES.find((w) => w[0] === weightClass)?.[1] || 0) * 110);
  const lowEditionBonus = editionNumber === 1 ? 250 : editionNumber <= 3 ? 120 : editionNumber <= 10 ? 40 : 0;
  return base + mutationBonus + auraBonus + sizeBonus + weightBonus + lowEditionBonus;
}

function serialTierFor({ tokenId, rarityRank }) {
  if (tokenId === 1) return 'Genesis #1';
  if (tokenId <= 10) return 'Genesis Ten';
  if (rarityRank <= 10) return 'Top 10 Rarity';
  if (rarityRank <= 50) return 'Top 50 Rarity';
  return 'Collection';
}

function buildRawTokens({ species, collectionSize }) {
  if (!Array.isArray(species) || species.length === 0) throw new Error('species required');
  if (!Number.isInteger(collectionSize) || collectionSize <= 0) throw new Error('collectionSize must be positive integer');

  const speciesPool = buildSpeciesPool(species);
  const editionCounts = new Map();
  const raw = [];

  for (let tokenId = 1; tokenId <= collectionSize; tokenId += 1) {
    const seed = hashInt(`bull-fish-blitz-${tokenId}`);
    const fish = speciesPool[seed % speciesPool.length];
    const editionNumber = (editionCounts.get(fish.id) || 0) + 1;
    editionCounts.set(fish.id, editionNumber);

    const mutation = weightedPick(MUTATIONS, seed + 17)[0];
    const aura = weightedPick(AURAS, seed + 29)[0];
    const sizeClass = weightedPick(SIZE_CLASSES, seed + 43)[0];
    const weightClass = weightedPick(WEIGHT_CLASSES, seed + 61)[0];
    const visualVariant = VISUAL_VARIANTS[(seed + editionNumber) % VISUAL_VARIANTS.length];
    const timeWindow = fish.time?.[seed % fish.time.length] || 'day';
    const waterBiome = fish.locations?.[(seed + tokenId) % fish.locations.length] || 'lake';
    const temperament = TEMPERAMENTS[(seed + tokenId + editionNumber) % TEMPERAMENTS.length];
    const rarityScore = rarityScoreForToken({ species: fish, editionNumber, mutation, aura, sizeClass, weightClass });

    raw.push({
      tokenId,
      species: fish,
      editionNumber,
      mutation,
      aura,
      sizeClass,
      weightClass,
      visualVariant,
      timeWindow,
      waterBiome,
      temperament,
      rarityScore,
    });
  }

  return raw;
}

function metadataForToken(token, rarityRank) {
  return {
    name: `Bull Fish #${token.tokenId} - ${token.species.name}`,
    description: `A limited Bull Fish Blitz catch NFT minted from verified Robinhood Chain gameplay. Art uses the ${token.species.name} species file; traits and rarity score make this edition unique.`,
    image: imageForSpecies(token.species),
    external_url: 'https://www.bullfishblitz.com',
    attributes: [
      { trait_type: 'Species', value: token.species.name },
      { trait_type: 'Species ID', value: token.species.id },
      { trait_type: 'Base Rarity', value: token.species.rarity },
      { trait_type: 'Edition Number', value: token.editionNumber, display_type: 'number' },
      { trait_type: 'Visual Variant', value: token.visualVariant },
      { trait_type: 'Mutation', value: token.mutation },
      { trait_type: 'Aura', value: token.aura },
      { trait_type: 'Size Class', value: token.sizeClass },
      { trait_type: 'Weight Class', value: token.weightClass },
      { trait_type: 'Water Biome', value: token.waterBiome },
      { trait_type: 'Time Window', value: token.timeWindow },
      { trait_type: 'Temperament', value: token.temperament },
      { trait_type: 'Serial Tier', value: serialTierFor({ tokenId: token.tokenId, rarityRank }) },
      { trait_type: 'Rarity Score', value: token.rarityScore, display_type: 'number' },
      { trait_type: 'Rarity Rank', value: rarityRank, display_type: 'number' },
    ],
  };
}

export function buildFishNftCollection({ species, collectionSize = 500 }) {
  const rawTokens = buildRawTokens({ species, collectionSize });
  const ranked = [...rawTokens].sort((a, b) => b.rarityScore - a.rarityScore || a.tokenId - b.tokenId);
  const rankByToken = new Map(ranked.map((token, index) => [token.tokenId, index + 1]));
  const metadata = rawTokens.map((token) => metadataForToken(token, rankByToken.get(token.tokenId)));
  const manifest = {
    collectionSize,
    speciesCount: species.length,
    generatedAt: new Date(0).toISOString(),
    tokens: rawTokens.map((token) => ({
      tokenId: token.tokenId,
      speciesId: token.species.id,
      speciesName: token.species.name,
      image: imageForSpecies(token.species),
      rarityScore: token.rarityScore,
      rarityRank: rankByToken.get(token.tokenId),
      metadata: `/nft/fish/metadata/${token.tokenId}.json`,
    })),
  };

  return { manifest, metadata };
}
