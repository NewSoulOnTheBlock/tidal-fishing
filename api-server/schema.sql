-- Tidal Fishing Database Schema
-- PostgreSQL 14+

-- Players table (wallet-based auth)
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) UNIQUE NOT NULL,
  username VARCHAR(50),
  profile_picture VARCHAR(255) DEFAULT 'default',
  bio TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP DEFAULT NOW(),
  total_play_time INTEGER DEFAULT 0,
  
  -- Stats
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  money INTEGER DEFAULT 0,
  total_catches INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  perfect_hooks INTEGER DEFAULT 0,
  snaps INTEGER DEFAULT 0,
  
  -- Progression
  unlocked_locations TEXT[] DEFAULT '{"lake"}',
  equipped_rod INTEGER DEFAULT 0,
  equipped_reel INTEGER DEFAULT 0,
  equipped_line INTEGER DEFAULT 0,
  equipped_bait INTEGER DEFAULT 0,
  owned_gear JSONB DEFAULT '{"rods":[0],"reels":[0],"lines":[0],"baits":[0]}',
  
  -- Engagement
  login_streak INTEGER DEFAULT 0,
  last_login_date DATE,
  
  CONSTRAINT wallet_address_check CHECK (length(wallet_address) >= 32)
);

CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet_address);
CREATE INDEX IF NOT EXISTS idx_players_created ON players(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_players_earned ON players(total_earned DESC);

-- Catches table (fish caught history)
CREATE TABLE IF NOT EXISTS catches (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  species_id VARCHAR(50) NOT NULL,
  location VARCHAR(20) NOT NULL,
  rarity VARCHAR(20) NOT NULL,
  size_cm NUMERIC(6,2) NOT NULL,
  weight_kg NUMERIC(8,3) NOT NULL,
  value INTEGER NOT NULL,
  perfect_hook BOOLEAN DEFAULT FALSE,
  caught_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_location CHECK (location IN ('lake', 'river', 'pier', 'ocean'))
);

CREATE INDEX IF NOT EXISTS idx_catches_player ON catches(player_id, caught_at DESC);
CREATE INDEX IF NOT EXISTS idx_catches_species ON catches(species_id);
CREATE INDEX IF NOT EXISTS idx_catches_rarity ON catches(rarity);
CREATE INDEX IF NOT EXISTS idx_catches_location ON catches(location);

-- Daily challenges table
CREATE TABLE IF NOT EXISTS daily_challenges (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  challenge_date DATE NOT NULL,
  challenge_id VARCHAR(100) NOT NULL,
  challenge_type VARCHAR(50) NOT NULL,
  target INTEGER NOT NULL,
  progress INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  reward INTEGER NOT NULL,
  completed_at TIMESTAMP,
  
  UNIQUE(player_id, challenge_date, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_challenges_player_date ON daily_challenges(player_id, challenge_date);

-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  achievement_id VARCHAR(50) NOT NULL,
  unlocked_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(player_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_achievements_player ON achievements(player_id);

-- Journal (species discovery log)
CREATE TABLE IF NOT EXISTS journal_entries (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  species_id VARCHAR(50) NOT NULL,
  first_caught_at TIMESTAMP DEFAULT NOW(),
  total_caught INTEGER DEFAULT 1,
  biggest_size_cm NUMERIC(6,2),
  biggest_weight_kg NUMERIC(8,3),
  
  UNIQUE(player_id, species_id)
);

CREATE INDEX IF NOT EXISTS idx_journal_player ON journal_entries(player_id);

-- Tournament scores
CREATE TABLE IF NOT EXISTS tournament_scores (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  tournament_date DATE NOT NULL,
  score INTEGER DEFAULT 0,
  catches INTEGER DEFAULT 0,
  best_catch VARCHAR(50),
  
  UNIQUE(player_id, tournament_date)
);

CREATE INDEX IF NOT EXISTS idx_tournament_date ON tournament_scores(tournament_date, score DESC);

-- Leaderboard view (top 100 players by earnings)
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
  p.wallet_address,
  p.username,
  p.level,
  p.total_catches,
  p.total_earned,
  p.perfect_hooks,
  COUNT(DISTINCT c.species_id) as unique_species,
  MAX(c.caught_at) as last_catch,
  p.created_at
FROM players p
LEFT JOIN catches c ON p.id = c.player_id
GROUP BY p.id
ORDER BY p.total_earned DESC
LIMIT 100;
