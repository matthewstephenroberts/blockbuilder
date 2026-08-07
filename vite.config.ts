import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, host: true },
  // Relative asset paths so the production build also works loaded via file://.
  base: "./",
});
