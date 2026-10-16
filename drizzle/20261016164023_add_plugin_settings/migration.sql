CREATE TABLE "plugin_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" text,
	"pluginId" text NOT NULL,
	"config" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_settings_owner_idx" ON "plugin_settings" ("userId","pluginId");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_settings_legacy_idx" ON "plugin_settings" ("pluginId") WHERE "userId" is null;--> statement-breakpoint
ALTER TABLE "plugin_settings" ADD CONSTRAINT "plugin_settings_userId_auth_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id");