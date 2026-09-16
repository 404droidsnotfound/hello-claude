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
import { checkTarget } from "./paths.js";

const WEB_DIR = fileURLToPath(new URL("../web/", import.meta.url));
const SRC_DIR = fileURLToPath(new URL("./", import.meta.url));
const HOST = "127.0.0.1";

// The only things this server will ever hand out. Anything else is a 404, token or not.
const STATIC = {
  "/":            { file: path.join(WEB_DIR, "index.html"),  type: "text/html; charset=utf-8" },
  "/generate.js": { file: path.join(SRC_DIR, "generate.js"), type: "text/javascript; charset=utf-8" },
};

const MAX_BODY = 256 * 1024;

/**
 * Parse a small JSON body. Anything oversized or malformed is treated as an empty object —
 * every handler validates its own fields anyway.
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<any>}
 */
function readJson(req) {
  return new Promise((resolve) => {
    let raw = ""; let over = false;
    req.on("data", (chunk) => { raw += chunk; if (raw.length > MAX_BODY) { over = true; req.destroy(); } });
    req.on("end", () => { if (over) return resolve({}); try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 */
function json(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

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

    const asset = req.method === "GET" ? STATIC[/** @type {keyof STATIC} */ (reqUrl.pathname)] : undefined;
    if (asset) {
      res.writeHead(200, { "content-type": asset.type, "cache-control": "no-store" });
      res.end(await readFile(asset.file, "utf8"));
      return;
    }

    if (req.method === "POST" && reqUrl.pathname === "/check") {
      const body = await readJson(req);
      json(res, 200, await checkTarget(typeof body?.path === "string" ? body.path : ""));
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
