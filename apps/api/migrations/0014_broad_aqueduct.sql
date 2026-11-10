CREATE INDEX "certificates_course_idx" ON "certificates" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "grants_created_by_idx" ON "grants" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "invites_course_idx" ON "invites" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "invites_created_by_idx" ON "invites" USING btree ("created_by_id");