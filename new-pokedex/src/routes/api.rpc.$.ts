import { createFileRoute } from "@tanstack/react-router";
import { rpcHandler, serve } from "#/orpc/handlers";

const handle = serve(rpcHandler, "/api/rpc");

export const Route = createFileRoute("/api/rpc/$")({
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
