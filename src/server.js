// @ts-check
// The local server behind `npx hello-claude`. Serves the wizard; nothing else yet.
//
// Security posture, because this process will eventually write to the user's disk:
//   - binds 127.0.0.1 only — never reachable from another machine
//   - a one-time token, minted at start and carried in the URL, gates every request —
//     without it, any web page open in the user's browser could drive this server
//     through localhost

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WEB_DIR = fileURLToPath(new URL("../web/", import.meta.url));
const HOST = "127.0.0.1";

/**
 * Start the server on a free port.
 * @param {{ port?: number }} [opts]  port 0 (default) lets the OS pick.
 * @returns {Promise<{ url: string, port: number, token: string, close: () => void }>}
 */
export function start(opts = {}) {
  const token = randomBytes(16).toString("hex");

  const server = createServer(async (req, res) => {
    const reqUrl = new URL(req.url ?? "/", `http://${HOST}`);

    if (reqUrl.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }

    if (reqUrl.searchParams.get("t") !== token) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden: this Hello Claude session's link is required. Use the URL printed in the terminal.");
      return;
    }

    if (req.method === "GET" && reqUrl.pathname === "/") {
      const html = await readFile(path.join(WEB_DIR, "index.html"), "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, HOST, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") { reject(new Error("no address")); return; }
      resolve({
        url: `http://${HOST}:${addr.port}/?t=${token}`,
        port: addr.port,
        token,
        close: () => server.close(),
      });
    });
  });
}
