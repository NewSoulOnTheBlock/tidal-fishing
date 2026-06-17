// Weather System - dynamic weather effects and modifiers

export const WEATHER_TYPES = {
  clear: {
    id: 'clear',
    label: 'Clear',
    icon: '☀️',
    biteRateMult: 1.0,
    difficultyMult: 1.0,
    rareSpawnBonus: 0,
    desc: 'Perfect fishing conditions',
  },
  cloudy: {
    id: 'cloudy',
    label: 'Cloudy',
    icon: '☁️',
    biteRateMult: 1.15,
    difficultyMult: 0.95,
    rareSpawnBonus: 0.05,
    desc: 'Fish are more active',
  },
  rain: {
    id: 'rain',
    label: 'Rain',
    icon: '🌧️',
    biteRateMult: 1.3,
    difficultyMult: 1.2,
    rareSpawnBonus: 0.1,
    desc: 'High bite rate, harder fights',
  },
  storm: {
    id: 'storm',
    label: 'Storm',
    icon: '⛈️',
    biteRateMult: 1.5,
    difficultyMult: 1.5,
    rareSpawnBonus: 0.25,
    desc: 'Extreme conditions - rare fish active!',
  },
  fog: {
    id: 'fog',
    label: 'Fog',
    icon: '🌫️',
    biteRateMult: 0.9,
    difficultyMult: 1.1,
    rareSpawnBonus: 0.15,
    desc: 'Mysterious conditions',
  },
};

export const MOON_PHASES = [
  { id: 'new', label: 'New Moon', icon: '🌑', nightBiteBonus: 1.3, legendaryBonus: 0.2 },
  { id: 'waxing_crescent', label: 'Waxing Crescent', icon: '🌒', nightBiteBonus: 1.1, legendaryBonus: 0.05 },
  { id: 'first_quarter', label: 'First Quarter', icon: '🌓', nightBiteBonus: 1.0, legendaryBonus: 0 },
  { id: 'waxing_gibbous', label: 'Waxing Gibbous', icon: '🌔', nightBiteBonus: 0.95, legendaryBonus: 0 },
  { id: 'full', label: 'Full Moon', icon: '🌕', nightBiteBonus: 1.5, legendaryBonus: 0.3 },
  { id: 'waning_gibbous', label: 'Waning Gibbous', icon: '🌖', nightBiteBonus: 0.95, legendaryBonus: 0 },
  { id: 'last_quarter', label: 'Last Quarter', icon: '🌗', nightBiteBonus: 1.0, legendaryBonus: 0 },
  { id: 'waning_crescent', label: 'Waning Crescent', icon: '🌘', nightBiteBonus: 1.1, legendaryBonus: 0.05 },
];

export function initWeather(save) {
  if (!save.weather) {
    save.weather = {
      current: 'clear',
      lastChange: Date.now(),
      changeInterval: 2 * 60 * 60 * 1000, // 2 hours
    };
  }
  return save.weather;
}

export function updateWeather(weather) {
  const now = Date.now();
  const elapsed = now - weather.lastChange;

  if (elapsed >= weather.changeInterval) {
    // Change weather
    const types = Object.keys(WEATHER_TYPES);
    const weights = [0.4, 0.25, 0.2, 0.1, 0.05]; // clear most common, storm rarest
    
    const roll = Math.random();
    let cumulative = 0;
    for (let i = 0; i < types.length; i++) {
      cumulative += weights[i];
      if (roll < cumulative) {
        weather.current = types[i];
        break;
      }
    }

    weather.lastChange = now;
    return true; // changed
  }

  return false; // no change
}

export function getCurrentWeather(weather) {
  return WEATHER_TYPES[weather.current] || WEATHER_TYPES.clear;
}

export function getMoonPhase() {
  // Calculate actual moon phase based on date
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Simplified moon phase calculation (days since known new moon)
  const knownNewMoon = new Date(2000, 0, 6); // Jan 6, 2000 was a new moon
  const daysSince = (now - knownNewMoon) / (24 * 60 * 60 * 1000);
  const lunarCycle = 29.53; // days
  const phase = (daysSince % lunarCycle) / lunarCycle;

  // Map to 8 phases
  const phaseIndex = Math.floor(phase * 8);
  return MOON_PHASES[phaseIndex] || MOON_PHASES[0];
}

export function getWeatherModifiers(weather, timeSegment) {
  const currentWeather = getCurrentWeather(weather);
  const moon = getMoonPhase();

  let biteMult = currentWeather.biteRateMult;
  let diffMult = currentWeather.difficultyMult;
  let rareBonus = currentWeather.rareSpawnBonus;

  // Apply moon phase bonuses at night
  if (timeSegment === 'night' || timeSegment === 'dusk') {
    biteMult *= moon.nightBiteBonus;
    rareBonus += moon.legendaryBonus;
  }

  return {
    biteRateMultiplier: biteMult,
    difficultyMultiplier: diffMult,
    rareSpawnBonus: rareBonus,
    weather: currentWeather,
    moon: (timeSegment === 'night' || timeSegment === 'dusk') ? moon : null,
  };
}
