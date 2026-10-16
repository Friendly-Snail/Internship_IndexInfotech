import { createFileRoute } from "@tanstack/react-router";
import { App } from "@/frontend/App";

// keep the current UI intact while later tasks introduce individual file routes
export const Route = createFileRoute("/ui")({ ssr: false, component: App });
