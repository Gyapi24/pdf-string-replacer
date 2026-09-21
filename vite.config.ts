import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const shim = (name: string) => resolve(rootDir, "web/shims", name);

export default defineConfig({
  root: "web",
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [rootDir],
    },
  },
  resolve: {
    alias: {
      "#tspdf/pageEditor.js": resolve(rootDir, "vendor/pageEditor.mjs"),
      "#tspdf/scanner.js": resolve(rootDir, "vendor/scanner.mjs"),
      "#tspdf/splicer.js": resolve(rootDir, "vendor/splicer.mjs"),
      "node:zlib": shim("zlib.ts"),
      "node:crypto": shim("crypto.ts"),
      "node:module": shim("module.ts"),
      "node:path": shim("path.ts"),
      "node:url": shim("url.ts"),
      "node:fs/promises": shim("fs.ts"),
    },
  },
  optimizeDeps: {
    include: ["buffer", "pako"],
    exclude: ["ts-pdf-edit"],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  define: {
    global: "globalThis",
  },
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
});
