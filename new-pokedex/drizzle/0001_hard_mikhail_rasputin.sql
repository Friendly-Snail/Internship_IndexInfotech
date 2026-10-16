ALTER TYPE "public"."battle_result" ADD VALUE 'TEAM1_WIN';--> statement-breakpoint
ALTER TYPE "public"."battle_result" ADD VALUE 'TEAM2_WIN';--> statement-breakpoint
CREATE TABLE "battle_participant" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "battle_participant_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"battle_id" integer NOT NULL,
	"pokemon_id" integer NOT NULL,
	"team_number" integer NOT NULL,
	"position" integer NOT NULL,
	"battle_score" integer NOT NULL,
	"total_stats" integer NOT NULL,
	"speed" integer NOT NULL,
	"type_multiplier" integer NOT NULL,
	CONSTRAINT "battle_participant_slot_unique" UNIQUE("battle_id","team_number","position"),
	CONSTRAINT "battle_participant_team_check" CHECK ("battle_participant"."team_number" IN (1, 2)),
	CONSTRAINT "battle_participant_position_check" CHECK ("battle_participant"."position" BETWEEN 1 AND 4)
);
--> statement-breakpoint
ALTER TABLE "battle_history" ALTER COLUMN "pokemon1_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_history" ALTER COLUMN "pokemon2_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_history" ALTER COLUMN "pokemon1_score" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_history" ALTER COLUMN "pokemon2_score" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_history" ALTER COLUMN "pokemon1_multiplier" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_history" ALTER COLUMN "pokemon2_multiplier" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_history" ADD COLUMN "team1_score" integer;--> statement-breakpoint
ALTER TABLE "battle_history" ADD COLUMN "team2_score" integer;--> statement-breakpoint
ALTER TABLE "battle_participant" ADD CONSTRAINT "battle_participant_battle_id_battle_history_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battle_history"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_participant" ADD CONSTRAINT "battle_participant_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_participant_battle_idx" ON "battle_participant" USING btree ("battle_id");