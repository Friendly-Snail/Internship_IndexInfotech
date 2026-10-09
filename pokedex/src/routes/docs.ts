import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import type { Auth } from "../auth";
import { createOpenApiDocument } from "../docs/openapi";

/**
 * Serve the cached OpenAPI contract and interactive Swagger UI.
 *
 * @param auth - Better Auth instance supplying auth metadata and the session cookie name.
 * @returns Public /api/docs/openapi.json and /api/docs routes without Pokemon database queries.
 */
export function createDocsRoutes(auth: Auth) {
  const routes = new Hono();
  let document: ReturnType<typeof createOpenApiDocument> | undefined;
  routes.get("/openapi.json", async (c) => {
    document ??= createOpenApiDocument(auth);
    return c.json(await document);
  });
  routes.get(
    "/",
    swaggerUI({
      url: "/api/docs/openapi.json",
      title: "Pokemon API documentation",
      version: "5.33.1",
      withCredentials: true,
      persistAuthorization: false,
      validatorUrl: "", // do not send the local specification to an external validator
      docExpansion: "list",
    }),
  );
  return routes;
}
