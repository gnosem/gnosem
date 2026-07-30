-- 0002_add_content_optimized.sql
-- Adds an LLM-optimized representation of long memories.
-- When a memory's raw content exceeds a token threshold, the write path runs it through
-- Workers AI (llama-3.1-8b-instruct) with a "structured facts" system prompt. The condensed
-- form is stored in content_optimized. Search and list return content_optimized by default
-- (fewer tokens for the reading LLM to ingest); clients can pass raw:true to get the original.

ALTER TABLE memories ADD COLUMN content_optimized TEXT;
ALTER TABLE memories ADD COLUMN content_bytes INTEGER;
ALTER TABLE memories ADD COLUMN optimized_bytes INTEGER;
