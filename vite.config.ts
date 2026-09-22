import { execSync } from "child_process";
import { resolve } from "path";
import { defineConfig } from "vite";

function gitShortHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_URL ?? "/JenesBoot/",
  build: {
    target: "es2022",
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        qa: resolve(__dirname, "qa/index.html"),
      },
      output: {
        // Keep qa-specific JS grouped under dist/qa/assets/ alongside its HTML.
        entryFileNames: (chunk) => {
          if (chunk.name === "qa") return "qa/assets/[name]-[hash].js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  resolve: {
    alias: {},
  },
  define: {
    __GIT_COMMIT__: JSON.stringify(gitShortHash()),
  },
});
