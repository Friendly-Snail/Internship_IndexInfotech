import "#/polyfill";

import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { SmartCoercionHandlerPlugin } from "@orpc/json-schema";
import { createFileRoute } from "@tanstack/react-router";
import { onError } from "@orpc/server";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";

import router from "#/orpc/router";
import { OpenAPIGenerator } from "@orpc/openapi";
import { auth } from "#/lib/auth";
import { db } from "#/db";

const generator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
});

const handler = new OpenAPIHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
  plugins: [
    new SmartCoercionHandlerPlugin({
      converters: [
        new ZodToJsonSchemaConverter(),
        // Add other schema converters as needed
      ],
    }),
    new OpenAPIReferenceHandlerPlugin({
      spec: () =>
        generator.generate(router, {
          base: {
            info: {
              title: "ORPC Playground",
              version: "1.0.0",
            },
            servers: [{ url: "https://api.example.com/v1" }],
          },
        }),
    }),
  ],
});

async function handle({ request }: { request: Request }) {
  const session = await auth.api.getSession({ headers: request.headers });

  const { response } = await handler.handle(request, {
    prefix: "/api",
    context: { session, db, reqHeaders: request.headers },
  });

  return response ?? new Response("Not Found", { status: 404 });
}

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
