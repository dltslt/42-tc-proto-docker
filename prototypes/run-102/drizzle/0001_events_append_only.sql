-- Events are an append-only log: no row is ever edited or deleted.
-- drizzle-kit cannot generate triggers, so this is a hand-written migration (generated with --custom).
CREATE FUNCTION "events_reject_change"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'events are append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "events_append_only"
	BEFORE UPDATE OR DELETE ON "events"
	FOR EACH ROW EXECUTE FUNCTION "events_reject_change"();
