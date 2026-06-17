// Tournament Mode - Timed competitive fishing events with prizes

export function initTournament(save) {
  if (!save.tournament) {
    save.tournament = {
      currentTournament: null,    // Active tournament data
      history: [],                 // Past tournament results
      totalWins: 0,
      totalParticipations: 0,
    };
  }
  return save.tournament;
}

// Tournament templates that rotate
export const TOURNAMENT_TYPES = [
  {
    id: "speed_catch",
    name: "Speed Fishing Challenge",
    description: "Catch as many fish as possible in 5 minutes",
    duration: 5 * 60 * 1000, // 5 minutes
    entryFee: 1000,
    prizePool: [5000, 3000, 2000],  // 1st, 2nd, 3rd
    location: "lake",
    scoring: "count",  // total fish caught
  },
  {
    id: "big_catch",
    name: "Biggest Fish Tournament",
    description: "Catch the biggest fish in 10 minutes",
    duration: 10 * 60 * 1000, // 10 minutes
    entryFee: 2500,
    prizePool: [12500, 7500, 5000],
    location: "river",
    scoring: "size",  // biggest single fish by cm
  },
  {
    id: "rare_hunt",
    name: "Legendary Hunt",
    description: "Catch the most rare/epic/legendary fish in 15 minutes",
    duration: 15 * 60 * 1000,
    entryFee: 5000,
    prizePool: [25000, 15000, 10000],
    location: "ocean",
    scoring: "rarity",  // count of rare+ fish
  },
  {
    id: "value_chase",
    name: "High Stakes Haul",
    description: "Earn the most $TIDE in 8 minutes",
    duration: 8 * 60 * 1000,
    entryFee: 3000,
    prizePool: [15000, 9000, 6000],
    location: "pier",
    scoring: "value",  // total $TIDE earned
  },
];

export function getTournamentSchedule() {
  // Tournaments run every 30 minutes at :00 and :30
  const now = new Date();
  const currentMinutes = now.getMinutes();
  const currentSeconds = now.getSeconds();
  
  // Calculate next 30-minute mark
  let nextMinutes = currentMinutes < 30 ? 30 : 0;
  const nextStart = new Date(now);
  nextStart.setMinutes(nextMinutes, 0, 0);
  
  // If we're past the next mark, add an hour
  if (nextStart <= now) {
    nextStart.setHours(nextStart.getHours() + 1);
  }

  // Rotate tournament types every 30 minutes
  const thirtyMinutesSinceEpoch = Math.floor(now.getTime() / (30 * 60 * 1000));
  const typeIndex = thirtyMinutesSinceEpoch % TOURNAMENT_TYPES.length;
  
  return {
    nextTournament: TOURNAMENT_TYPES[typeIndex],
    nextStart: nextStart.getTime(),
    timeUntil: nextStart - now,
  };
}

export function canJoinTournament(tournament, playerMoney) {
  if (!tournament) return { ok: false, reason: "No active tournament" };
  if (tournament.started) return { ok: false, reason: "Tournament already started" };
  if (playerMoney < tournament.entryFee) return { ok: false, reason: "Not enough $TIDE" };
  return { ok: true };
}

export function startTournament(tournament) {
  tournament.started = true;
  tournament.startTime = Date.now();
  tournament.endTime = Date.now() + tournament.duration;
  tournament.score = 0;
  tournament.catches = [];
}

export function updateTournamentScore(tournament, fish) {
  if (!tournament || !tournament.started) return;
  if (Date.now() > tournament.endTime) return;

  tournament.catches.push({
    species: fish.speciesId,
    size: fish.sizeCm,
    value: fish.value,
    rarity: fish.rarity,
    timestamp: Date.now(),
  });

  // Update score based on scoring type
  switch (tournament.type.scoring) {
    case "count":
      tournament.score = tournament.catches.length;
      break;
    case "size":
      tournament.score = Math.max(...tournament.catches.map(c => c.size));
      break;
    case "rarity":
      tournament.score = tournament.catches.filter(c => 
        c.rarity === 'rare' || c.rarity === 'epic' || c.rarity === 'legendary'
      ).length;
      break;
    case "value":
      tournament.score = tournament.catches.reduce((sum, c) => sum + c.value, 0);
      break;
  }
}

export function endTournament(tournament) {
  if (!tournament) return null;
  
  tournament.ended = true;
  tournament.duration = Date.now() - tournament.startTime;
  
  return {
    score: tournament.score,
    catches: tournament.catches.length,
    type: tournament.type,
  };
}

export function formatTournamentScore(score, type) {
  switch (type) {
    case "count":
      return `${score} fish`;
    case "size":
      return `${score.toFixed(1)}cm`;
    case "rarity":
      return `${score} rare`;
    case "value":
      return `${score} $TIDE`;
    default:
      return score;
  }
}
