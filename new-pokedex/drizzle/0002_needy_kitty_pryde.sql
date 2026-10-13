CREATE TABLE "pokemon_stat" (
	"pokemon_id" integer NOT NULL,
	"stat_name" varchar(100) NOT NULL,
	"base_stat" integer NOT NULL,
	CONSTRAINT "pokemon_stat_pokemon_id_stat_name_pk" PRIMARY KEY("pokemon_id","stat_name")
);
--> statement-breakpoint
ALTER TABLE "pokemon_stat" ADD CONSTRAINT "pokemon_stat_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "pokemon_stat" ("pokemon_id", "stat_name", "base_stat")
SELECT p."id", s.key, (s.value #>> '{}')::integer
FROM "pokemon" p CROSS JOIN LATERAL jsonb_each(p."stats") AS s(key, value);
