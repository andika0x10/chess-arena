CREATE TABLE users (id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE games (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)), revision INTEGER NOT NULL, result TEXT NOT NULL, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 6), eligible INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX games_history ON games(user_id, updated_at DESC);
CREATE TABLE achievements (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, level INTEGER NOT NULL, game_id TEXT NOT NULL REFERENCES games(id), PRIMARY KEY(user_id,level));
CREATE TABLE reviews (game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, version TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(game_id,version));
