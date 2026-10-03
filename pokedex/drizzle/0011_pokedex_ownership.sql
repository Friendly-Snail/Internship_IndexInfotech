CREATE TABLE "pokedex" (
	"user_id" text NOT NULL,
	"pokemon_id" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pokedex_user_id_pokemon_id_pk" PRIMARY KEY("user_id","pokemon_id")
);

--> statement-breakpoint
ALTER TABLE "pokedex" ADD CONSTRAINT "pokedex_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pokedex" ADD CONSTRAINT "pokedex_pokemon_id_pokemon_id_fk" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "pokedex_pokemon_id_idx" ON "pokedex" USING btree ("pokemon_id");
