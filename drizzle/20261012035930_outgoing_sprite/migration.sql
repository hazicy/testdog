CREATE TABLE "login_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" text,
	"name" text NOT NULL,
	"website" text NOT NULL,
	"loginTestId" uuid NOT NULL,
	"checkUrl" text NOT NULL,
	"successText" text NOT NULL,
	"inputs" jsonb DEFAULT '{}' NOT NULL,
	"ttlMinutes" integer DEFAULT 60 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"lastVerifiedAt" timestamp with time zone,
	"lastError" text,
	"verificationRunId" uuid,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_state_caches" (
	"key" text PRIMARY KEY,
	"identityId" uuid NOT NULL,
	"encryptedState" text,
	"expiresAt" timestamp with time zone,
	"lockToken" uuid,
	"lockUntil" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "authenticationVerification" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "login_identities_owner_idx" ON "login_identities" ("userId","updatedAt");--> statement-breakpoint
CREATE INDEX "login_state_caches_identity_idx" ON "login_state_caches" ("identityId");--> statement-breakpoint
ALTER TABLE "login_identities" ADD CONSTRAINT "login_identities_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");--> statement-breakpoint
ALTER TABLE "login_identities" ADD CONSTRAINT "login_identities_loginTestId_test_cases_id_fkey" FOREIGN KEY ("loginTestId") REFERENCES "test_cases"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "login_identities" ADD CONSTRAINT "login_identities_verificationRunId_test_runs_id_fkey" FOREIGN KEY ("verificationRunId") REFERENCES "test_runs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "login_state_caches" ADD CONSTRAINT "login_state_caches_identityId_login_identities_id_fkey" FOREIGN KEY ("identityId") REFERENCES "login_identities"("id") ON DELETE CASCADE;