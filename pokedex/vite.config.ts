import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { env } from "./src/env";

export default defineConfig({
  server: { port: env.PORT, strictPort: true },
  preview: { port: env.PORT, strictPort: true },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [tanstackStart(), viteReact()],
});
