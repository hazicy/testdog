CREATE TABLE "browser_provider_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" text,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encryptedConfig" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "browser_provider_integrations_owner_idx" ON "browser_provider_integrations" ("userId","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "browser_provider_integrations_active_owner_idx" ON "browser_provider_integrations" ("userId") WHERE "enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "browser_provider_integrations_active_legacy_idx" ON "browser_provider_integrations" ((1)) WHERE "userId" is null and "enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "browser_provider_integrations_legacy_idx" ON "browser_provider_integrations" ("provider") WHERE "userId" is null;--> statement-breakpoint
ALTER TABLE "browser_provider_integrations" ADD CONSTRAINT "browser_provider_integrations_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");