DELETE FROM "run_artifacts" WHERE "kind" NOT IN ('screenshot', 'video', 'trace');--> statement-breakpoint
ALTER TABLE "run_artifacts" DROP CONSTRAINT "run_artifacts_kind_check", ADD CONSTRAINT "run_artifacts_kind_check" CHECK ("kind" in ('screenshot','video','trace'));
