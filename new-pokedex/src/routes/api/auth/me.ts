import { createFileRoute } from "@tanstack/react-router";
import { openAPIHandler, serve } from "#/orpc/handlers";

// /api/auth/* belongs to Better Auth; this static route sends /api/auth/me to oRPC instead
const handle = serve(openAPIHandler, "/api");

export const Route = createFileRoute("/api/auth/me")({
  server: { handlers: { GET: handle, HEAD: handle } },
});
