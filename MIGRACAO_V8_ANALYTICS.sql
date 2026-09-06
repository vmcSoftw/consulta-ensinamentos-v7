CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'search','ask','question_open','bible_search',
    'concordance_search','dossier','history_view'
  )),
  query_text TEXT,
  normalized_query TEXT,
  entity_type TEXT,
  entity_id BIGINT,
  source_page TEXT,
  result_count INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_type_created
  ON usage_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_query_created
  ON usage_events (normalized_query, created_at DESC)
  WHERE normalized_query IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_events_entity_created
  ON usage_events (entity_type, entity_id, created_at DESC)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

ALTER TABLE search_synonyms
  ADD COLUMN IF NOT EXISTS weight NUMERIC(5,2) NOT NULL DEFAULT 1.00;

ALTER TABLE search_synonyms
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_search_synonyms_enabled_term
  ON search_synonyms (enabled, lower(term));

CREATE INDEX IF NOT EXISTS idx_source_sections_year_type
  ON source_sections (year, source_type);

CREATE INDEX IF NOT EXISTS idx_qb_sources_topic
  ON question_bank_sources (topic_id)
  WHERE topic_id IS NOT NULL;
