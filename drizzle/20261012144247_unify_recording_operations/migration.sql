-- Stop API/worker writers before migration and restart with the matching application.
-- Temporary helpers normalize both executed records and operation-only snapshots.
CREATE FUNCTION pg_temp.canonical_step(step jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  action jsonb;
  assertion jsonb;
  legacy jsonb;
BEGIN
  action := coalesce(nullif(step->'platformAction', 'null'::jsonb), nullif(step->'action', 'null'::jsonb));
  IF action IS NOT NULL AND NOT (action ? 'platform') THEN
    action := jsonb_build_object('platform', 'web', 'action', action);
  END IF;
  assertion := nullif(step->'platformAssertion', 'null'::jsonb);
  legacy := nullif(step->'playwrightAssertion', 'null'::jsonb);
  -- Preserve the old replay precedence when a record contains both representations.
  IF action IS NULL AND legacy IS NOT NULL THEN
    assertion := jsonb_strip_nulls(jsonb_build_object(
      'platform', 'web',
      'type', CASE legacy->>'type'
        WHEN 'toBeVisible' THEN 'visible' WHEN 'toHaveText' THEN 'text'
        WHEN 'toContainText' THEN 'containsText' WHEN 'toHaveValue' THEN 'value'
        WHEN 'toHaveURL' THEN 'url' ELSE legacy->>'type' END,
      'target', legacy->'target', 'value', legacy->'value', 'negate', legacy->'negate'));
  END IF;
  RETURN (step - 'platformAction' - 'playwrightAssertion' - 'action' - 'platformAssertion')
    || CASE WHEN action IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('action', action) END
    || CASE WHEN assertion IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('platformAssertion', assertion) END;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.canonical_operations(steps jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(
    (SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
     FROM jsonb_each(pg_temp.canonical_step(entry))
     WHERE key IN ('kind', 'title', 'pageId', 'surface', 'planNodeId', 'action',
                   'assertion', 'platformAssertion', 'condition', 'decision')) ORDER BY position), '[]'::jsonb)
  FROM jsonb_array_elements(steps) WITH ORDINALITY AS items(entry, position);
$$;
--> statement-breakpoint
UPDATE run_steps AS step
SET action = pg_temp.canonical_step(to_jsonb(step))->'action',
    "platformAssertion" = pg_temp.canonical_step(to_jsonb(step))->'platformAssertion';
--> statement-breakpoint
UPDATE recording_versions SET steps = pg_temp.canonical_operations(steps);
--> statement-breakpoint
UPDATE test_runs SET "recordingSteps" = pg_temp.canonical_operations("recordingSteps")
WHERE jsonb_typeof("recordingSteps") = 'array';
--> statement-breakpoint
-- Nested steps also live in cached API responses and issue evidence snapshots.
CREATE FUNCTION pg_temp.canonical_payload(payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  result jsonb;
  item record;
BEGIN
  IF jsonb_typeof(payload) = 'array' THEN
    SELECT coalesce(jsonb_agg(pg_temp.canonical_payload(entry) ORDER BY position), '[]'::jsonb)
      INTO result FROM jsonb_array_elements(payload) WITH ORDINALITY AS items(entry, position);
    RETURN result;
  ELSIF jsonb_typeof(payload) = 'object' THEN
    IF payload ? 'pageId' AND payload ? 'kind' AND payload ? 'title' THEN
      payload := pg_temp.canonical_step(payload);
    END IF;
    result := '{}'::jsonb;
    FOR item IN SELECT key, value FROM jsonb_each(payload) LOOP
      result := result || jsonb_build_object(item.key,
        CASE WHEN item.key = 'recordingSteps' AND jsonb_typeof(item.value) = 'array'
          THEN pg_temp.canonical_operations(item.value)
          ELSE pg_temp.canonical_payload(item.value) END);
    END LOOP;
    RETURN result;
  END IF;
  RETURN payload;
END;
$$;
--> statement-breakpoint
-- SSE catch-up records use the same representation as current database reads.
UPDATE realtime_outbox SET data = pg_temp.canonical_payload(data) WHERE kind IN ('step', 'run');
--> statement-breakpoint
UPDATE issue_occurrences SET snapshot = pg_temp.canonical_payload(snapshot);
--> statement-breakpoint
UPDATE submission_requests SET response = pg_temp.canonical_payload(response) WHERE response IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "run_steps" DROP COLUMN "platformAction";
--> statement-breakpoint
ALTER TABLE "run_steps" DROP COLUMN "playwrightAssertion";
