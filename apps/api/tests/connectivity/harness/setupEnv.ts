/**
 * Vitest setup file for the connectivity journeys. Runs in every worker
 * before each journey file is imported, i.e. before src/config/env.ts loads.
 */
import path from "node:path";
import { apiRootFromCwd, assertIsolatedEnvironment, assertNoDotenvFiles } from "./isolation";

const apiRoot = apiRootFromCwd();
// env.ts does `import "dotenv/config"`, which honours DOTENV_CONFIG_PATH.
// Point it at a file that does not exist so no .env is ever loaded.
process.env.DOTENV_CONFIG_PATH = path.join(apiRoot, "tests", "connectivity", "__no_dotenv_for_connectivity_harness__");
assertNoDotenvFiles(apiRoot);
assertIsolatedEnvironment(process.env);
