import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  // keep database, authentication and credentials out of the browser bundle.
  const { httpApp } = await import("@/http/app");
  return httpApp.fetch(request);
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
      OPTIONS: handle,
      HEAD: handle,
    },
  },
});
