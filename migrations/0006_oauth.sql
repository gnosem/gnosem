-- OAuth 2.1 support (applied to prod D1 2026-08-25 via Claude/Cloudflare MCP; additive)
ALTER TABLE api_keys ADD COLUMN kind TEXT NOT NULL DEFAULT 'api';
ALTER TABLE api_keys ADD COLUMN expires_at INTEGER;
CREATE TABLE IF NOT EXISTS oauth_clients (client_id TEXT PRIMARY KEY, client_name TEXT, redirect_uris TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_codes (code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, user_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL, scope TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, client_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER, rotated_to TEXT);
CREATE INDEX IF NOT EXISTS idx_oauth_rt_user ON oauth_refresh_tokens(user_id);
