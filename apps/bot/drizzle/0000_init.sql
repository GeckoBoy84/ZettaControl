CREATE TABLE "guild_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"manager_role_ids" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "panels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"panel_username" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"panel_id" uuid NOT NULL,
	"role_id" text NOT NULL,
	"server_id" text DEFAULT '*' NOT NULL,
	"server_name" text,
	"level" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_panel_id_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "panels_owner_name_idx" ON "panels" USING btree ("scope","owner_id","name");--> statement-breakpoint
CREATE INDEX "panels_owner_idx" ON "panels" USING btree ("scope","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_grants_target_idx" ON "role_grants" USING btree ("panel_id","role_id","server_id");--> statement-breakpoint
CREATE INDEX "role_grants_role_idx" ON "role_grants" USING btree ("role_id");