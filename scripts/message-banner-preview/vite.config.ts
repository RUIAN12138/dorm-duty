import { defineConfig } from "../../frontend/node_modules/vite/dist/node/index.js";
import vue from "../../frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: fileURLToPath(new URL("../../frontend/public", import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: {
      vue: fileURLToPath(
        new URL(
          "../../frontend/node_modules/vue/dist/vue.esm-bundler.js",
          import.meta.url,
        ),
      ),
    },
  },
  build: {
    target: "esnext",
    outDir: fileURLToPath(
      new URL("../../data/message-banner/site-dist", import.meta.url),
    ),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 8093,
    fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] },
  },
});
