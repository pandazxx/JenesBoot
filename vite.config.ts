import { execSync } from "child_process";
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
  },
  resolve: {
    alias: {},
  },
  define: {
    __GIT_COMMIT__: JSON.stringify(gitShortHash()),
  },
});
