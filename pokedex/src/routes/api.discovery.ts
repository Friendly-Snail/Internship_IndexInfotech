import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/discovery")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { httpApp } = await import("@/http/app");
        const url = new URL(request.url);
        url.pathname = "/";
        return httpApp.fetch(new Request(url, request));
      },
    },
  },
});
