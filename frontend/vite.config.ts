import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
const apiOrigin = process.env.DORM_API_ORIGIN || "http://127.0.0.1:8000";
const base = process.env.DORM_WEB_BASE || "/";
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))
  throw new Error("DORM_WEB_BASE 必须是以 / 开头和结尾的安全路径");
const paths = [
  "/email",
  "/guest",
  "/chores",
  "/auth",
  "/dorms",
  "/duties",
  "/notifications",
  "/push",
  "/health",
  "/docs",
  "/openapi.json",
];
export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        lang: "zh-CN",
        id: base,
        name: "轮到 · 宿舍值日",
        short_name: "轮到",
        start_url: base,
        scope: base,
        display: "standalone",
        theme_color: "#111111",
        background_color: "#FFFFFF",
        icons: [
          { src: `${base}icon-192.png`, sizes: "192x192", type: "image/png" },
          { src: `${base}icon-512.png`, sizes: "512x512", type: "image/png" },
          {
            src: `${base}icon-maskable.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(paths.map((p) => [p, { target: apiOrigin }])),
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: Object.fromEntries(paths.map((p) => [p, { target: apiOrigin }])),
  },
});
