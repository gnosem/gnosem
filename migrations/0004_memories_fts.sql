-- 0004_memories_fts.sql
-- Full-text-search index for keyword hits (BM25) alongside the semantic (Vectorize)
-- index. Cosine similarity misses exact-string matches — IDs, dates, code snippets,
-- proper nouns — which BM25 catches. The reader (memory_search) blends both hit
-- lists via Reciprocal Rank Fusion (RRF, k=60).
--
-- Contentless FTS5: memories_fts stores only the tokens; the content itself lives
-- exclusively in `memories`. Row identity is the memory `id` (rowid-mapped via the
-- `content_rowid` isn't used because our PK is a UUID; instead we JOIN by id text).
--
-- Triggers keep the index in sync with the source table for INSERT / UPDATE / DELETE.
-- Content updates (superseded_by, forgotten_at) don't retokenize because we filter
-- those rows out at query time, not at index-write time.

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  id UNINDEXED,
  content,
  content_optimized,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Sync triggers. Fired only when the rows we care about change.
DROP TRIGGER IF EXISTS memories_ai;
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(id, content, content_optimized)
  VALUES (new.id, new.content, COALESCE(new.content_optimized, ''));
END;

DROP TRIGGER IF EXISTS memories_ad;
CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  DELETE FROM memories_fts WHERE id = old.id;
END;

DROP TRIGGER IF EXISTS memories_au;
CREATE TRIGGER memories_au AFTER UPDATE OF content, content_optimized ON memories BEGIN
  DELETE FROM memories_fts WHERE id = old.id;
  INSERT INTO memories_fts(id, content, content_optimized)
  VALUES (new.id, new.content, COALESCE(new.content_optimized, ''));
END;

-- Backfill existing rows into the FTS index. Idempotent-ish: on re-run, this reinserts
-- everything (FTS5 tolerates duplicate rowids per docs but not for external content —
-- for contentless tables the id UNINDEXED column just becomes duplicated). Safer to
-- clear first when applied to a populated store.
DELETE FROM memories_fts;
INSERT INTO memories_fts(id, content, content_optimized)
SELECT id, content, COALESCE(content_optimized, '') FROM memories;
