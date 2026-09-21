import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Where this portal is served from. Defaults to the domain root, which is
  // what `npm run dev` wants; the combined static-site build sets it to
  // "/creator/" because that deploy serves the landing page at the root and
  // each portal under a subpath (see scripts/merge-web-deploy.js).
  //
  // PORTAL_BASE holds a BARE SEGMENT ("creator"), not a path, and
  // deliberately not `vite build --base=/creator/`. Git Bash's MSYS path
  // translation rewrites anything shaped like an absolute path — in a CLI
  // argument AND in an env var value — so both `--base=/creator/` and
  // `PORTAL_BASE=/creator/` arrive as "/Program Files/Git/creator/" on the
  // Windows machine this repo is developed on. Verified by hand, both forms.
  // A bare word is never translated, so this behaves identically in Git
  // Bash, PowerShell and CI. The same class of bug already bit the Static
  // Web Apps workflows once — see their app_location comments.
  //
  // src/main.tsx reads the resulting value back via import.meta.env.BASE_URL
  // for the router's basename, so the two cannot drift.
  base: process.env.PORTAL_BASE ? `/${process.env.PORTAL_BASE}/` : "/",
  server: {
    // Distinct port from admin-web (5173) and the parallel Gym Partner
    // Lite portal — see docs/admin/07-open-questions-gaps.md's 21 Sep 2026
    // entry for the port assignment.
    port: 5176,
  },
});
