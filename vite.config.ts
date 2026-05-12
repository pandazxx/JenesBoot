import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_URL ?? "/JenesBoot/",
  build: {
    target: "es2022",
    outDir: "dist",
  },
  resolve: {
    alias: {},
  },
});
