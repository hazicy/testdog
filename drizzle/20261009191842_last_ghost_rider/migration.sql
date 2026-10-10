CREATE TABLE "automation_resources" (
	"id" text PRIMARY KEY,
	"hostId" text NOT NULL,
	"platform" text NOT NULL,
	"profileId" text NOT NULL,
	"deviceId" text,
	"status" text DEFAULT 'available' NOT NULL,
	"owner" text,
	"runId" uuid,
	"fencingToken" integer DEFAULT 0 NOT NULL,
	"leaseUntil" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	CONSTRAINT "automation_resource_status_check" CHECK ("status" in ('available','busy','quarantined'))
);
--> statement-breakpoint
CREATE TABLE "automation_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"runId" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"sequence" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_workers" (
	"id" text PRIMARY KEY,
	"hostId" text NOT NULL,
	"platforms" jsonb NOT NULL,
	"heartbeatAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "resourceId" text;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "fencingToken" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "leaseUntil" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "queuedAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "preparingAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "executingAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "finalizingAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "errorCode" text;--> statement-breakpoint
ALTER TABLE "test_runs" ALTER COLUMN "workerId" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_resource_device_unique" ON "automation_resources" ("hostId","platform","deviceId");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_event_sequence_unique" ON "automation_run_events" ("runId","attempt","sequence");--> statement-breakpoint
ALTER TABLE "automation_resources" ADD CONSTRAINT "automation_resources_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "automation_run_events" ADD CONSTRAINT "automation_run_events_runId_test_runs_id_fkey" FOREIGN KEY ("runId") REFERENCES "test_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "test_runs" DROP CONSTRAINT "test_runs_status_check", ADD CONSTRAINT "test_runs_status_check" CHECK ("status" in ('queued','preparing','running','finalizing','passed','failed','cancelled'));