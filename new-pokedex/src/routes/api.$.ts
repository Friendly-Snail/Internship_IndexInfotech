import { createFileRoute } from "@tanstack/react-router";
import { openAPIHandler, serve } from "#/orpc/handlers";

const handle = serve(openAPIHandler, "/api");

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      HEAD: handle,
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
});
