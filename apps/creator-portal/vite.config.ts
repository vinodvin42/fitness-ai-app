import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Distinct port from admin-web (5173) and the parallel Gym Partner
    // Lite portal — see docs/admin/07-open-questions-gaps.md's 21 Sep 2026
    // entry for the port assignment.
    port: 5176,
  },
});
