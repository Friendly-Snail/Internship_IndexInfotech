CREATE TABLE "pokemon_element_type" (
	"name" varchar(100) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokemon_type" (
	"pokemon_id" integer NOT NULL,
	"type_name" varchar(100) NOT NULL,
	"slot" integer NOT NULL,
	CONSTRAINT "pokemon_type_pokemon_id_type_name_pk" PRIMARY KEY("pokemon_id","type_name"),
	CONSTRAINT "pokemon_type_slot_unique" UNIQUE("pokemon_id","slot")
);
--> statement-breakpoint
CREATE TABLE "type_matchup" (
	"attacking_type" varchar(100) NOT NULL,
	"defending_type" varchar(100) NOT NULL,
	"multiplier" integer NOT NULL,
	CONSTRAINT "type_matchup_attacking_type_defending_type_pk" PRIMARY KEY("attacking_type","defending_type")
);
--> statement-breakpoint
ALTER TABLE "pokemon_type" ADD CONSTRAINT "pokemon_type_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokemon_type" ADD CONSTRAINT "pokemon_type_type_name_pokemon_element_type_name_fk" FOREIGN KEY ("type_name") REFERENCES "public"."pokemon_element_type"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_matchup" ADD CONSTRAINT "type_matchup_attacking_type_pokemon_element_type_name_fk" FOREIGN KEY ("attacking_type") REFERENCES "public"."pokemon_element_type"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_matchup" ADD CONSTRAINT "type_matchup_defending_type_pokemon_element_type_name_fk" FOREIGN KEY ("defending_type") REFERENCES "public"."pokemon_element_type"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pokemon_type_name_idx" ON "pokemon_type" USING btree ("type_name");
--> statement-breakpoint
INSERT INTO "pokemon_element_type" ("name")
SELECT DISTINCT name FROM (
  SELECT jsonb_array_elements_text("types") AS name FROM "pokemon"
  UNION ALL
  SELECT chart.key AS name FROM "pokemon" CROSS JOIN LATERAL jsonb_each("type_relations") AS chart(key, value)
  UNION ALL
  SELECT jsonb_array_elements_text(chart.value -> relation.kind) AS name
  FROM "pokemon" CROSS JOIN LATERAL jsonb_each("type_relations") AS chart(key, value)
  CROSS JOIN (VALUES ('doubleDamageTo'), ('halfDamageTo'), ('noDamageTo')) AS relation(kind)
) names;
--> statement-breakpoint
INSERT INTO "pokemon_type" ("pokemon_id", "type_name", "slot")
SELECT p."id", t.value #>> '{}', t.ordinality::integer
FROM "pokemon" p CROSS JOIN LATERAL jsonb_array_elements(p."types") WITH ORDINALITY AS t(value, ordinality);
--> statement-breakpoint
INSERT INTO "type_matchup" ("attacking_type", "defending_type", "multiplier")
SELECT DISTINCT ON (chart.key, defending.name) chart.key, defending.name, relation.multiplier
FROM "pokemon" p CROSS JOIN LATERAL jsonb_each(p."type_relations") AS chart(key, value)
CROSS JOIN (VALUES ('doubleDamageTo', 200), ('halfDamageTo', 50), ('noDamageTo', 0)) AS relation(kind, multiplier)
CROSS JOIN LATERAL jsonb_array_elements_text(chart.value -> relation.kind) AS defending(name)
ORDER BY chart.key, defending.name, relation.multiplier;
