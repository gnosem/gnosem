-- sharedmem D1 schema
-- Users, per-user API keys (hashed), and memory metadata.
-- Vector embeddings live in Vectorize (index name: sharedmem-embeddings).
-- The Vectorize vector_id is the same as the memory row's uuid.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,          -- uuid v4
  email        TEXT UNIQUE,               -- optional; null for API-key-only accounts
  created_at   INTEGER NOT NULL           -- ms epoch
);

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash     TEXT PRIMARY KEY,          -- SHA-256 hex of the plaintext bearer key
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT,                      -- optional name ('claude-desktop', 'cursor-work-laptop')
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at   INTEGER                    -- soft-delete; check IS NULL to authenticate
);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys(user_id);

CREATE TABLE IF NOT EXISTS memories (
  id             TEXT PRIMARY KEY,        -- uuid v4; also the Vectorize vector_id
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,           -- the fact / note / preference itself
  tags           TEXT,                    -- JSON array string, e.g. '["preference","stack"]'
  written_by     TEXT,                    -- 'claude-code' | 'gpt-5' | 'kimi-k2' | 'cursor' | 'manual' | ...
  session_id     TEXT,                    -- opaque, provided by the writing client
  created_at     INTEGER NOT NULL,
  superseded_by  TEXT REFERENCES memories(id),  -- for correction chains; NULL = current
  forgotten_at   INTEGER                  -- soft-delete; excluded from search/read when set
);
CREATE INDEX IF NOT EXISTS memories_user_idx ON memories(user_id);
CREATE INDEX IF NOT EXISTS memories_user_active_idx ON memories(user_id, forgotten_at, superseded_by);
