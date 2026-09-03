#!/usr/bin/env node
/**
 * Go-live hardening (4 Sep 2026) — combines two independently-built static
 * sites into one deployable folder for a single Azure Static Web App:
 *   - apps/landing (plain static HTML/CSS/JS, no build step) at the site
 *     ROOT — this is what visitors see first.
 *   - apps/user-mobile's Expo web export (apps/user-mobile/dist/) under
 *     /app/ — the real, working web app, reachable via the landing page's
 *     "Log In" link.
 *
 * Why this is safe to flatten together rather than needing real subpath
 * config on the Expo side: Expo's web build already references its own
 * assets via root-absolute paths (`/_expo/...`), which resolve correctly
 * from the domain root regardless of what page requested them — so
 * `apps/user-mobile/dist`'s _expo/, assets/, and metadata.json can sit at
 * the combined site's root exactly as they already do standalone; only
 * its index.html needs to move to a real /app/index.html so it doesn't
 * collide with the landing page's own root index.html. The one thing that
 * does need checking on each run (this script does it) is whether
 * apps/landing's own assets/ folder and Expo's assets/ folder ever
 * collide on an actual filename — see the check below.
 *
 * Run from the repo root: node scripts/merge-web-deploy.js <outputDir>
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const landingDir = path.join(repoRoot, "apps/landing");
const mobileDistDir = path.join(repoRoot, "apps/user-mobile/dist");
const outputDir = path.resolve(repoRoot, process.argv[2] || "combined-web-deploy");

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Merge src's contents into dest, erroring loudly on any file that would
// silently overwrite an existing one — a real collision here is a bug
// worth stopping the build for, not papering over.
function mergeRecursive(src, dest, relPath = "") {
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const entryRel = relPath ? `${relPath}/${entry}` : entry;
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      mergeRecursive(srcPath, destPath, entryRel);
    } else {
      if (fs.existsSync(destPath)) {
        throw new Error(
          `Refusing to overwrite: ${entryRel} exists in both apps/landing and apps/user-mobile/dist. ` +
            `Rename one side to resolve the collision — this script deliberately fails loudly instead of silently picking one.`,
        );
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(mobileDistDir)) {
  console.error(`Missing ${mobileDistDir} — run "npm run build:mobile" first.`);
  process.exit(1);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

// 1. Landing page at the root — everything except its own dev-only files
//    (package.json/serve.js/README.md aren't meant to be served) and its
//    own staticwebapp.config.json, which this script replaces below with
//    one that also knows about /app/.
const landingSkip = new Set(["package.json", "serve.js", "README.md", "staticwebapp.config.json", "node_modules"]);
for (const entry of fs.readdirSync(landingDir)) {
  if (landingSkip.has(entry)) continue;
  copyRecursive(path.join(landingDir, entry), path.join(outputDir, entry));
}

// 2. The Expo web app's supporting files land at the SAME root — safe
//    because Expo's own HTML references them via root-absolute paths.
//    metadata.json isn't needed for a plain static deploy (it's an Expo
//    Updates manifest) but is harmless to include.
mergeRecursive(path.join(mobileDistDir, "_expo"), (() => {
  const d = path.join(outputDir, "_expo");
  fs.mkdirSync(d, { recursive: true });
  return d;
})());
if (fs.existsSync(path.join(mobileDistDir, "assets"))) {
  fs.mkdirSync(path.join(outputDir, "assets"), { recursive: true });
  mergeRecursive(path.join(mobileDistDir, "assets"), path.join(outputDir, "assets"), "assets");
}
if (fs.existsSync(path.join(mobileDistDir, "metadata.json"))) {
  fs.copyFileSync(path.join(mobileDistDir, "metadata.json"), path.join(outputDir, "metadata.json"));
}

// 3. The Expo app's own index.html moves to /app/index.html — this is the
//    ONE file that would otherwise collide with landing's root index.html.
fs.mkdirSync(path.join(outputDir, "app"), { recursive: true });
fs.copyFileSync(path.join(mobileDistDir, "index.html"), path.join(outputDir, "app", "index.html"));

// 4. Combined routing config — /app/* always serves the app's own
//    index.html (so client-side React Navigation survives a refresh deep
//    inside the app); everything else that isn't a real file falls back to
//    the landing page.
fs.writeFileSync(
  path.join(outputDir, "staticwebapp.config.json"),
  JSON.stringify(
    {
      // Two entries, not three — Azure's own config validation rejects
      // the deploy outright ("duplicate route /app/") if both "/app/" and
      // "/app/*" are listed: the wildcard already covers the trailing-
      // slash case internally. "/app" (no slash) is a distinct literal
      // route Azure does NOT fold into the wildcard, so it still needs
      // its own entry.
      routes: [
        { route: "/app", rewrite: "/app/index.html" },
        { route: "/app/*", rewrite: "/app/index.html" },
      ],
      navigationFallback: {
        rewrite: "/index.html",
        exclude: ["/app/*", "/_expo/*", "/assets/*", "/favicon.svg", "/robots.txt"],
      },
      globalHeaders: {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
      mimeTypes: {
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
      },
    },
    null,
    2,
  ) + "\n",
);

console.log(`Combined web deploy written to ${outputDir}`);
