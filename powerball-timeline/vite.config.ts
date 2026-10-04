import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { getDrawPayload } from "./src/server/draws";

function drawsApi(): Plugin {
  const attach = (middlewares: { use: (handler: (req: { url?: string }, res: NodeResponse, next: () => void) => void) => void }) => {
    middlewares.use((req, res, next) => {
      const path = req.url?.split("?")[0];
      if (path !== "/api/draws") {
        next();
        return;
      }
      void getDrawPayload()
        .then((payload) => {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(payload));
        })
        .catch((error: unknown) => {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to load drawings.",
            }),
          );
        });
    });
  };

  return {
    name: "powerball-draws-api",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

interface NodeResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body: string) => void;
}

export default defineConfig({
  plugins: [react(), drawsApi()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
