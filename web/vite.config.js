import { defineConfig } from "vite";

// vite-plus reads a standard Vite config. We target Baseline (Widely Available)
// browsers — modern enough to ship native ES modules with no legacy transpile,
// conservative enough to run everywhere Baseline guarantees.
export default defineConfig({
  root: ".",
  build: {
    target: "baseline-widely-available",
    outDir: "dist",
    emptyOutDir: true,
  },
});
