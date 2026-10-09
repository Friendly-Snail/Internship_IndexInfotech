import { Hono } from "hono";
import type { PokemonService } from "../services/pokemon";

/** List types under /api/types, completing the resource cache when needed. */
export function createTypeResourceRoutes(service: PokemonService) {
  const routes = new Hono();
  routes.get("/", async (c) => {
    const names = await service.getResourceNames("type");
    return c.json({ count: names.length, types: names, source: "database" });
  });
  return routes;
}

/** List regions under /api/regions, completing the resource cache when needed. */
export function createRegionResourceRoutes(service: PokemonService) {
  const routes = new Hono();
  routes.get("/", async (c) => {
    const names = await service.getResourceNames("region");
    return c.json({ count: names.length, regions: names, source: "database" });
  });
  return routes;
}
