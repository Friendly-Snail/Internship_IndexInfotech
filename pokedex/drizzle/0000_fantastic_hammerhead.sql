CREATE TYPE "public"."battle_result" AS ENUM('POKEMON1_WIN', 'POKEMON2_WIN', 'TIE');--> statement-breakpoint
CREATE TABLE "battle_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "battle_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pokemon1_id" integer NOT NULL,
	"pokemon2_id" integer NOT NULL,
	"result" "battle_result" NOT NULL,
	"decided_by" varchar(100) NOT NULL,
	"pokemon1_score" integer NOT NULL,
	"pokemon2_score" integer NOT NULL,
	"pokemon1_multiplier" integer NOT NULL,
	"pokemon2_multiplier" integer NOT NULL,
	"fought_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokemon" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"stats" jsonb NOT NULL,
	"types" jsonb NOT NULL,
	"type_relations" jsonb NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pokemon_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "battle_history" ADD CONSTRAINT "battle_history_pokemon1_id_pokemon_id_fk" FOREIGN KEY ("pokemon1_id") REFERENCES "public"."pokemon"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_history" ADD CONSTRAINT "battle_history_pokemon2_id_pokemon_id_fk" FOREIGN KEY ("pokemon2_id") REFERENCES "public"."pokemon"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_history_fought_at_idx" ON "battle_history" USING btree ("fought_at");--> statement-breakpoint
CREATE INDEX "battle_history_pokemon1_idx" ON "battle_history" USING btree ("pokemon1_id");--> statement-breakpoint
CREATE INDEX "battle_history_pokemon2_idx" ON "battle_history" USING btree ("pokemon2_id");