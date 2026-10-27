import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Same setup as apps/admin-web, plus the `@/` alias shadcn/ReUI components import through.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: { port: 5175 },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change far less often than the app, so they get their own
        // cached files: a release then re-downloads only the app chunk.
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/ },
            { name: "ui", test: /node_modules[\\/](@base-ui|@floating-ui|sonner|lucide-react|tailwind-merge|clsx|class-variance-authority)[\\/]/ },
            { name: "data", test: /node_modules[\\/](@tanstack|axios|i18next|react-i18next)[\\/]/ },
          ],
        },
      },
    },
  },
});
