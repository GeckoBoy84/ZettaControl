CREATE TABLE "panel_stats_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"panel_id" uuid NOT NULL,
	"alert_channel_id" text,
	"mention_role_id" text,
	"state" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "panel_stats_boards_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "panels" ADD COLUMN "admin_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "panel_stats_boards" ADD CONSTRAINT "panel_stats_boards_panel_id_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "panel_stats_boards_guild_idx" ON "panel_stats_boards" USING btree ("guild_id");