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
import { planWrite, applyWrite } from "./write.js";

const WEB_DIR = fileURLToPath(new URL("../web/", import.meta.url));
const SRC_DIR = fileURLToPath(new URL("./", import.meta.url));
const HOST = "127.0.0.1";

// The only things this server will ever hand out. Anything else is a 404, token or not.
const STATIC = {
  "/":            { file: path.join(WEB_DIR, "index.html"),  type: "text/html; charset=utf-8" },
  "/generate.js": { file: path.join(SRC_DIR, "generate.js"), type: "text/javascript; charset=utf-8" },
  "/diff.js":     { file: path.join(SRC_DIR, "diff.js"),     type: "text/javascript; charset=utf-8" },
};

const MAX_BODY = 256 * 1024;

/** @param {unknown} v */
const str = (v) => (typeof v === "string" ? v : "");

/** Answers must at least be an object with a string path; generate.js tolerates the rest. @param {unknown} v @returns {v is import("./generate.js").Answers} */
function isAnswers(v) {
  return !!v && typeof v === "object" && typeof (/** @type {any} */ (v)).path === "string";
}

/** Only the two words we act on survive. @param {unknown} v */
function decisionsOf(v) {
  /** @type {Record<string, "overwrite" | "keep">} */
  const out = {};
  if (v && typeof v === "object") for (const [k, d] of Object.entries(v)) if (d === "overwrite" || d === "keep") out[k] = d;
  return out;
}

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
 * @param {{ port?: number, home?: string, onWrite?: (results: import("./write.js").WriteResult[]) => void, onDone?: () => void }} [opts]
 *   port 0 (default) lets the OS pick. home is for tests. onWrite/onDone let the CLI narrate and exit.
 * @returns {Promise<{ url: string, port: number, token: string, close: () => void }>}
 */
export function start(opts = {}) {
  const token = randomBytes(16).toString("hex");
  const pathOpts = opts.home ? { home: opts.home } : {};

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
      json(res, 200, await checkTarget(str(body?.path), { ...pathOpts, memoryDir: str(body?.memoryDir) }));
      return;
    }

    if (req.method === "POST" && reqUrl.pathname === "/plan") {
      const body = await readJson(req);
      if (!isAnswers(body?.answers)) { json(res, 400, { ok: false, reason: "bad-answers" }); return; }
      json(res, 200, await planWrite(body.answers, { ...pathOpts, memoryDir: str(body?.memoryDir) }));
      return;
    }

    if (req.method === "POST" && reqUrl.pathname === "/write") {
      const body = await readJson(req);
      if (!isAnswers(body?.answers)) { json(res, 400, { ok: false, reason: "bad-answers" }); return; }
      // Re-plan here rather than trusting a plan sent by the page: the plan decides paths, and
      // paths are the one thing this server must not take on faith.
      const plan = await planWrite(body.answers, { ...pathOpts, memoryDir: str(body?.memoryDir) });
      if (!plan.ok) { json(res, 200, plan); return; }
      try {
        const results = await applyWrite(plan, decisionsOf(body?.decisions));
        opts.onWrite?.(results);
        json(res, 200, { ok: true, results });
      } catch (err) {
        json(res, 500, { ok: false, reason: "write-failed", message: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (req.method === "POST" && reqUrl.pathname === "/done") {
      json(res, 200, { ok: true });
      res.on("finish", () => opts.onDone?.());
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
