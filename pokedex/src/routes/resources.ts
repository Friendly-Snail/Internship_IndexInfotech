import { Hono } from "hono";
import type { PokemonService } from "../services/pokemon";

/**
 * Register database-backed type and region list endpoints.
 *
 * @param service - Shared helpers that complete and read resource lists.
 * @returns Public GET /types and GET /regions routes.
 */
export function createResourceRoutes(service: PokemonService) {
  const routes = new Hono();
  const { getResourceNames } = service;
  // fill each complete resource list once, then serve it from the database
  routes.get("/types", async (c) => {
    const names = await getResourceNames("type");
    return c.json({ count: names.length, types: names, source: "database" });
  });

  routes.get("/regions", async (c) => {
    const names = await getResourceNames("region");
    return c.json({ count: names.length, regions: names, source: "database" });
  });

  return routes;
}
