-- 0003_rate_limits.sql — Sliding-window rate limiter table.
-- Key format: "<endpoint>:<ip>", e.g. "signup:203.0.113.42". Window is per-key.
-- Old rows can be purged with `DELETE FROM rate_limits WHERE window_start < ?`
-- on a schedule if desired; not required for correctness (rows self-reset when
-- the window expires on the next hit).

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL      -- ms epoch, start of current window
);
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits(window_start);
