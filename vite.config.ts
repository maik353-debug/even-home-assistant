import { defineConfig, type Plugin } from "vite";

const HA_PROXY_TARGET = "http://192.168.178.154:8123";

// In dev mode, the proxy target is already the known HA URL — expose it for auto-discover.
function haDiscoveryPlugin(): Plugin {
  return {
    name: "ha-discovery",
    configureServer(server) {
      server.middlewares.use("/api/ha-discover", (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ url: HA_PROXY_TARGET }));
      });
    },
  };
}

export default defineConfig({
  base: "./",
  build: {
    assetsDir: ".",
  },
  plugins: [haDiscoveryPlugin()],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      "/ha": {
        target: HA_PROXY_TARGET,
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
