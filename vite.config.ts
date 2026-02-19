import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      "/ha": {
        target: "http://192.168.178.154:8123",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ha/, ""),
      },
    },
  },
  preview: {
    host: true,
    port: 3000,
    strictPort: true,
  },
});
