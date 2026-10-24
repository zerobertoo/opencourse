CREATE TABLE "stream_leases" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"last_beat_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stream_leases" ADD CONSTRAINT "stream_leases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_leases" ADD CONSTRAINT "stream_leases_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_leases" ADD CONSTRAINT "stream_leases_asset_id_video_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."video_assets"("id") ON DELETE cascade ON UPDATE no action;