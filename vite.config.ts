import { defineConfig } from "vite";

export default defineConfig({
  base: "/JenesBoot/",
  build: {
    target: "es2022",
    outDir: "dist",
  },
  resolve: {
    alias: {},
  },
});
