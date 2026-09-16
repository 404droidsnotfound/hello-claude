// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { start } from "../src/server.js";

test("server: token gates everything; /check answers about a real folder", async () => {
  const { url, port, token, close } = await start();
  const base = `http://127.0.0.1:${port}`;
  const proj = await mkdtemp(path.join(tmpdir(), "hc-proj-"));
  try {
    assert.equal((await fetch(base + "/")).status, 403);
    assert.equal((await fetch(base + "/?t=wrong")).status, 403);
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(`${base}/generate.js?t=${token}`)).headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal((await fetch(`${base}/server.js?t=${token}`)).status, 404);

    const post = (body) => fetch(`${base}/check?t=${token}`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal((await fetch(`${base}/check`, { method: "POST", body: "{}" })).status, 403);
    const c = await (await post(JSON.stringify({ path: proj }))).json();
    assert.equal(c.ok, true);
    assert.equal(c.resolved, path.resolve(proj));
    const bad = await (await post("this is not json")).json();
    assert.deepEqual(bad, { ok: false, reason: "empty" });
  } finally {
    close();
    await rm(proj, { recursive: true, force: true });
  }
});
