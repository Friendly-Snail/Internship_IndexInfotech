import "#/polyfill";

import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { createFileRoute } from "@tanstack/react-router";
import router from "#/orpc/router";
import { auth } from "#/lib/auth";
import { db } from "#/db";

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

async function handle({ request }: { request: Request }) {
  const session = await auth.api.getSession({ headers: request.headers });

  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: { session, db, reqHeaders: request.headers },
  });

  return response ?? new Response("Not Found", { status: 404 });
}

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
