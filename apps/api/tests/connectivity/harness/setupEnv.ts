/**
 * Vitest setup file for the connectivity journeys. Runs before each
 * journey file is imported, i.e. before src/config/env.ts loads.
 */
import path from "node:path";
import { assertIsolatedEnvironment } from "./isolation";

// Never let a developer's apps/api/.env leak real SMTP/AI/Razorpay values
// into the harness: env.ts does `import "dotenv/config"`, which honours
// DOTENV_CONFIG_PATH. Point it at a file that does not exist.
process.env.DOTENV_CONFIG_PATH = path.join(__dirname, "__no_dotenv_for_connectivity_harness__");

assertIsolatedEnvironment(process.env);
