#!/usr/bin/env node
/**
 * Go-live hardening (4 Sep 2026) — combines two independently-built static
 * sites into one deployable folder for a single Azure Static Web App:
 *   - apps/landing (plain static HTML/CSS/JS, no build step) at the site
 *     ROOT — this is what visitors see first. Its own "Download the app"
 *     section is the consumer path (Android APK).
 *   - a second app's already-built dist/ folder under /app/ — a login
 *     console reachable via a link on the landing page. Generalized 4 Sep
 *     2026 (same day, a few hours later) to take that app's dist path as
 *     an argument rather than hardcoding one: it merged with
 *     apps/user-mobile first, then apps/coach-mobile, then this site
 *     itself moved from being coach-mobile's to being admin-web's — see
 *     each deploy workflow's own comment for which app is merged where
 *     and why, since that decision has moved more than once and belongs
 *     there, not duplicated in every version of this comment.
 *
 * Why this is safe to flatten together rather than needing real subpath
 * config on the second app's own build: both Vite (admin-web) and Expo's
 * web export (coach-mobile) already reference their own assets via
 * root-absolute paths (Vite's `/assets/...`, Expo's `/_expo/...` +
 * `/assets/...`), which resolve correctly from the domain root regardless
 * of what page requested them — so that app's own asset folders can sit
 * at the combined site's root exactly as they already do standalone; only
 * its index.html needs to move to a real /app/index.html so it doesn't
 * collide with the landing page's own root index.html. The one thing that
 * does need checking on each run (this script does it) is whether
 * apps/landing's own assets/ folder and the other app's assets/ folder
 * ever collide on an actual filename — see the check below. Confirmed
 * clean for both apps tried so far: landing's are subfoldered
 * (assets/css/*, assets/js/*, assets/favicon.svg), Vite's and Expo's are
 * both flat/hashed or namespaced differently (assets/index-<hash>.{js,css}
 * for Vite, assets/__node_modules/* for Expo).
 *
 * Run from the repo root: node scripts/merge-web-deploy.js <outputDir> <appDistDir>
 * appDistDir is relative to the repo root, e.g. apps/admin-web/dist.
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const landingDir = path.join(repoRoot, "apps/landing");
const outputDir = path.resolve(repoRoot, process.argv[2] || "combined-web-deploy");
const appDistArg = process.argv[3];
if (!appDistArg) {
  console.error("Usage: node scripts/merge-web-deploy.js <outputDir> <appDistDir>");
  console.error("  appDistDir example: apps/admin-web/dist");
  process.exit(1);
}
const appDistDir = path.resolve(repoRoot, appDistArg);

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
          `Refusing to overwrite: ${entryRel} exists in both apps/landing and ${appDistArg}. ` +
            `Rename one side to resolve the collision — this script deliberately fails loudly instead of silently picking one.`,
        );
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(appDistDir)) {
  console.error(`Missing ${appDistDir} — build that app first.`);
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

// 2. The other app's own supporting files land at the SAME root — safe
//    because that app's own HTML references them via root-absolute paths.
//    Copy every top-level entry from its dist/ EXCEPT index.html (moved
//    below) and its own staticwebapp.config.json (this script writes a
//    combined one instead) — generic over whatever that app's build
//    happens to produce (Vite's assets/, Expo's _expo/ + assets/ +
//    metadata.json, or anything else), rather than hardcoding folder
//    names tied to one specific app.
const appDistSkip = new Set(["index.html", "staticwebapp.config.json"]);
for (const entry of fs.readdirSync(appDistDir)) {
  if (appDistSkip.has(entry)) continue;
  const srcPath = path.join(appDistDir, entry);
  const destPath = path.join(outputDir, entry);
  if (fs.existsSync(destPath)) {
    // Both sides have a top-level entry with this name (e.g. both have an
    // assets/ folder) — merge their contents instead of a flat copy, so a
    // real per-file collision still throws instead of one side silently
    // replacing the other's whole folder.
    mergeRecursive(srcPath, destPath, entry);
  } else {
    copyRecursive(srcPath, destPath);
  }
}

// 3. The other app's own index.html moves to /app/index.html — this is
//    the ONE file that would otherwise collide with landing's own root
//    index.html.
fs.mkdirSync(path.join(outputDir, "app"), { recursive: true });
fs.copyFileSync(path.join(appDistDir, "index.html"), path.join(outputDir, "app", "index.html"));

// 4. Combined routing config — /app/* always serves the other app's own
//    index.html (so its client-side routing survives a refresh deep
//    inside it); everything else that isn't a real file falls back to the
//    landing page.
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

console.log(`Combined web deploy written to ${outputDir} (landing + ${appDistArg})`);
