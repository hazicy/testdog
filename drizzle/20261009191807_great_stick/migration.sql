ALTER TABLE "run_artifacts" ADD COLUMN "surface" jsonb;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD COLUMN "producer" text;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "run_steps" ADD COLUMN "platformAction" jsonb;--> statement-breakpoint
ALTER TABLE "run_steps" ADD COLUMN "surface" jsonb;--> statement-breakpoint
ALTER TABLE "run_steps" ADD COLUMN "observationRevision" integer;