import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  build: {
    target: "es2022",
    lib: {
      entry: fileURLToPath(new URL("./src/integration/bridge.ts", import.meta.url)),
      name: "ParokshPrivacyShield",
      formats: ["iife"],
      fileName: () => "privacy-shield.bundle.js",
    },
    outDir: fileURLToPath(new URL("../extension-core/", import.meta.url)),
    emptyOutDir: false,
    sourcemap: false,
    minify: "esbuild",
  },
});
