-- Keep existing function OIDs so triggers retain their dependencies during upgrades.
DO $$
DECLARE
  fn record;
  old_prefix text;
  new_name text;
BEGIN
  SELECT left(p.proname, length(p.proname) - length('run_revision')) INTO old_prefix
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.test_runs'::regclass AND NOT t.tgisinternal
    AND p.proname ~ '_run_revision$' AND p.proname != 'testdog_run_revision';
  IF old_prefix IS NULL THEN RETURN; END IF;

  FOR fn IN
    SELECT p.oid, p.proname::text AS name, pg_get_function_identity_arguments(p.oid) AS arguments,
      substring(p.proname FROM '(run_revision|realtime_event|notification_emit|notify_run|notify_issue)$') AS suffix
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        old_prefix || 'run_revision', old_prefix || 'realtime_event',
        old_prefix || 'notification_emit', old_prefix || 'notify_run', old_prefix || 'notify_issue'
      ])
  LOOP
    new_name := 'testdog_' || fn.suffix;
    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', fn.name, fn.arguments, new_name);
    -- PL/pgSQL helper calls are stored as source text, so update them as well.
    EXECUTE replace(pg_get_functiondef(fn.oid), old_prefix, 'testdog_');
  END LOOP;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT t.tgname, c.relname,
      'testdog_' || substring(t.tgname FROM '(run_revision|run_event|step_event|artifact_event|log_event|test_event|execution_event|notify_run|notify_issue)$') AS new_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
      AND p.proname IN ('testdog_run_revision', 'testdog_realtime_event', 'testdog_notify_run', 'testdog_notify_issue')
      AND t.tgname !~ '^testdog_'
      AND t.tgname ~ '_(run_revision|run_event|step_event|artifact_event|log_event|test_event|execution_event|notify_run|notify_issue)$'
  LOOP
    EXECUTE format('ALTER TRIGGER %I ON public.%I RENAME TO %I', item.tgname, item.relname, item.new_name);
  END LOOP;
END;
$$;
