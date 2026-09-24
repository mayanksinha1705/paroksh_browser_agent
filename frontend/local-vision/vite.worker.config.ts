import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Mirrors frontend/privacy-shield/vite.integration.config.ts: a single
// dependency-free bundle, just built as an ES module ("es") instead of an
// IIFE, because Web Workers created with `{ type: "module" }` require an ES
// module entry point (this is what lets qwen-worker.js use plain `import`
// statements for @huggingface/transformers and the other qwen-*.js files).
export default defineConfig({
  build: {
    target: "es2022",
    lib: {
      entry: fileURLToPath(new URL("./qwen/qwen-worker.js", import.meta.url)),
      formats: ["es"],
      fileName: () => "qwen-worker.bundle.js",
    },
    outDir: fileURLToPath(new URL(".", import.meta.url)),
    emptyOutDir: false,
    sourcemap: false,
    minify: "esbuild",
  },
});
