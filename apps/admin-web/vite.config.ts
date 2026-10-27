import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `@/` is the alias the shadcn/ReUI components (src/components/ui) import through.
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
  },
});
