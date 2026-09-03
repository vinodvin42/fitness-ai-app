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
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer((req, res) => {
  const requestedPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const relativePath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = path.normalize(path.join(ROOT, relativePath));

  // Guard against path traversal outside this folder.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Single static page — anything unrecognized falls back to index.html,
      // mirroring staticwebapp.config.json's navigationFallback behavior.
      fs.readFile(path.join(ROOT, "index.html"), (fallbackErr, fallbackData) => {
        if (fallbackErr) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
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
  console.log(`23PrimeFit landing page → http://localhost:${PORT}`);
});
