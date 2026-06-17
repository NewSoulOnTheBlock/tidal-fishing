// Profile avatars - predefined fish-themed profile pictures

export const PROFILE_AVATARS = [
  { id: 'default', emoji: '🎣', label: 'Fisher', color: '#4A9EFF' },
  { id: 'fish_1', emoji: '🐟', label: 'Fish', color: '#FF9F43' },
  { id: 'tropical', emoji: '🐠', label: 'Tropical', color: '#26DE81' },
  { id: 'blowfish', emoji: '🐡', label: 'Blowfish', color: '#FED330' },
  { id: 'shark', emoji: '🦈', label: 'Shark', color: '#778CA3' },
  { id: 'dolphin', emoji: '🐬', label: 'Dolphin', color: '#4B7BEC' },
  { id: 'whale', emoji: '🐋', label: 'Whale', color: '#3867D6' },
  { id: 'octopus', emoji: '🐙', label: 'Octopus', color: '#A55EEA' },
  { id: 'squid', emoji: '🦑', label: 'Squid', color: '#8854D0' },
  { id: 'shrimp', emoji: '🦐', label: 'Shrimp', color: '#FC5C65' },
  { id: 'crab', emoji: '🦀', label: 'Crab', color: '#EB3B5A' },
  { id: 'lobster', emoji: '🦞', label: 'Lobster', color: '#FA8231' },
  { id: 'seal', emoji: '🦭', label: 'Seal', color: '#4B6584' },
  { id: 'otter', emoji: '🦦', label: 'Otter', color: '#778CA3' },
  { id: 'turtle', emoji: '🐢', label: 'Turtle', color: '#20BF6B' },
  { id: 'jellyfish', emoji: '🪼', label: 'Jellyfish', color: '#A55EEA' },
  { id: 'anchor', emoji: '⚓', label: 'Anchor', color: '#2C3E50' },
  { id: 'ship', emoji: '🚢', label: 'Ship', color: '#596275' },
  { id: 'wave', emoji: '🌊', label: 'Wave', color: '#4A9EFF' },
  { id: 'fishing', emoji: '🎣', label: 'Rod', color: '#F39C12' },
  { id: 'crown', emoji: '👑', label: 'Crown', color: '#FFD700' },
  { id: 'trophy', emoji: '🏆', label: 'Trophy', color: '#FFC312' },
  { id: 'star', emoji: '⭐', label: 'Star', color: '#FFD700' },
  { id: 'fire', emoji: '🔥', label: 'Fire', color: '#FC5C65' },
];

export function getAvatar(id) {
  return PROFILE_AVATARS.find(a => a.id === id) || PROFILE_AVATARS[0];
}

export function getRandomAvatar() {
  return PROFILE_AVATARS[Math.floor(Math.random() * PROFILE_AVATARS.length)];
}
