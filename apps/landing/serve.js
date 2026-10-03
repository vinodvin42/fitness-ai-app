/**
 * Zero-dependency static file server for local preview only.
 * Not used in production — Azure Static Web Apps serves this folder
 * directly (see staticwebapp.config.json). Node core modules only, so
 * `npm run dev --workspace=apps/landing` works with no install step.
 *
 * Usage:  node serve.js            (defaults to http://localhost:4173)
 *         PORT=8080 node serve.js  (custom port)
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
  // Added with the site's photography and self-hosted fonts. Without an
  // entry here the fallback type made Chrome refuse the video outright
  // and treat the woff2 files as something it would not use as a font,
  // so a local preview silently lost both — the one thing this server
  // exists to show faithfully.
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
};

/*
 * Mirrors staticwebapp.config.json's `routes`, so a local run resolves
 * the invite and referral links the same way production does. Without
 * this, /gym/ABC123 works on the deployed site and 404s (or silently
 * renders the home page) locally — which is exactly the class of
 * difference that gets noticed after launch.
 */
function rewriteRoute(requestedPath) {
  if (requestedPath === "/") return "/index.html";
  if (requestedPath.startsWith("/gym/")) return "/gym-invite.html";
  if (requestedPath.startsWith("/r/")) return "/referral.html";
  return requestedPath;
}

const server = http.createServer((req, res) => {
  const requestedPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const relativePath = rewriteRoute(requestedPath);
  const filePath = path.normalize(path.join(ROOT, relativePath));

  // Guard against path traversal outside this folder.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Anything unrecognized serves the real 404 page with a real 404
      // status, mirroring staticwebapp.config.json. This used to fall
      // back to index.html with a 200, which meant a mistyped URL looked
      // like a working home page to both people and crawlers.
      fs.readFile(path.join(ROOT, "404.html"), (fallbackErr, fallbackData) => {
        if (fallbackErr) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fallbackData);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Fynrox landing page → http://localhost:${PORT}`);
});
