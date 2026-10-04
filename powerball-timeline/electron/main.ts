import { app, BrowserWindow, nativeImage, type NativeImage } from "electron";
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { getDrawPayload } from "../src/server/draws";

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

function windowIcon(): NativeImage | undefined {
  const resourcesPath = (process as { resourcesPath?: unknown }).resourcesPath;
  const candidates = [
    typeof resourcesPath === "string" ? path.join(resourcesPath, "icon.ico") : "",
    path.join(app.getAppPath(), "build", "icon.ico"),
    path.join(process.cwd(), "build", "icon.ico"),
  ].filter((candidate) => candidate.length > 0);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }
  return undefined;
}

function uiRoot(): string {
  const candidates = [
    path.join(app.getAppPath(), "dist"),
    path.join(process.cwd(), "dist"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  throw new Error("The built app was not found. Run npm run build first.");
}

function startServer(root: string): Promise<{ server: http.Server; port: number }> {
    const rootPath = path.resolve(root);
    const rootPrefix = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;
    const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/api/draws") {
      void getDrawPayload()
        .then((payload) => {
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify(payload));
        })
        .catch((error: unknown) => {
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Failed to load drawings.",
            }),
          );
        });
      return;
    }

    const requested = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
    const filePath = path.resolve(rootPath, requested);
    if (filePath !== rootPath && !filePath.startsWith(rootPrefix)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const serve = (target: string) => {
      if (!existsSync(target) || !statSync(target).isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(target) });
      createReadStream(target).pipe(res);
    };

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      serve(filePath);
      return;
    }
    serve(path.join(rootPath, "index.html"));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The local app server did not report a port."));
        return;
      }
      console.log(`PowerBall Predictor http://127.0.0.1:${address.port}/`);
      resolve({ server, port: address.port });
    });
  });
}

async function openWindow(): Promise<void> {
  const root = uiRoot();
  const { server, port } = await startServer(root);
  const window = new BrowserWindow({
    width: 1100,
    height: 900,
    minWidth: 360,
    minHeight: 640,
    title: "PowerBall Predictor",
    icon: windowIcon(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.on("closed", () => {
    server.close();
  });

  await window.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(() => {
  void openWindow().catch((error: unknown) => {
    console.error(error);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
