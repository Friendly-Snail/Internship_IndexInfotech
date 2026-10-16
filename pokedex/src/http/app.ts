import { auth } from "../auth";
import { db } from "../db";
import { createApp } from "../app";
import { createPokemonService } from "../services/pokemon";

// this module is imported only inside server-route handlers
export const httpApp = createApp(auth, db, createPokemonService());
