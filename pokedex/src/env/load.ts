import { config } from "dotenv";

// Load configuration before T3 Env validates it, including in non-Bun tools
// existing process values win; .env.local takes precedence over .env.
config({ path: [".env.local", ".env"], override: false, quiet: true });
