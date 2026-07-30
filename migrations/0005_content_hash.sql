-- 0005_content_hash.sql
-- Byte-identical dedup: memory_write hashes trim(content) with SHA-256 and, if the
-- (user_id, content_hash) pair already has an active row, short-circuits before doing
-- ANY expensive work (no embed, no optimize, no vector upsert). Complementary to the
-- semantic dedup added in the previous migration: hash catches the cheap case, semantic
-- catches the paraphrase case.
--
-- Existing rows are backfilled server-side by a lazy path: no bulk backfill script here
-- because there are only ~50 memories in production today and we prefer not to run
-- long-running SQL in a migration. New rows populate content_hash going forward; old
-- rows without a hash simply skip hash-dedup (and still get semantic dedup).

ALTER TABLE memories ADD COLUMN content_hash TEXT;
CREATE INDEX IF NOT EXISTS memories_user_hash_idx ON memories(user_id, content_hash);
