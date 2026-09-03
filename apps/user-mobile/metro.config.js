// Metro config for running apps/user-mobile inside this npm-workspaces
// monorepo (docs/platform/project-structure.md §2). Without this, Metro
// only looks for node_modules inside apps/user-mobile itself — but npm
// workspaces hoists shared dependencies (react, expo, @fitness-ai-app/types,
// etc.) up to the repo root's node_modules, so bundling fails outright
// ("Cannot resolve entry file") without pointing Metro at both locations.
// This is Expo's own documented monorepo pattern, not a project-specific
// hack: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo (not just this app) so changes to workspace
// packages like @fitness-ai-app/types are picked up.
config.watchFolders = [workspaceRoot];

// Let Metro find modules hoisted to the workspace root, in addition to
// this app's own node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
