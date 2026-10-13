import frontend from "./frontend/index.html";

/** Serve the React page with Bun's bundler and delegate other requests to Hono. */
export function createServerOptions(
  fetch: (request: Request) => Response | Promise<Response>,
  port: number,
) {
  return {
    port,
    // Bun bundles the HTML's TypeScript/React/CSS assets for the browser
    routes: {
      "/ui": frontend,
      "/ui/": frontend,
    },
    // Hono continues to handle discovery, API routes, and unknown paths
    fetch,
  };
}
