// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULTS } from "../src/generate.js";
import { start } from "../src/server.js";

test("server: /plan shows what exists, /write honours decisions, /done fires onDone", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "hc-home-"));
  const proj = await mkdtemp(path.join(tmpdir(), "hc-proj-"));
  await mkdir(path.join(home, ".claude", "projects"), { recursive: true });
  await writeFile(path.join(proj, "CLAUDE.md"), "# mine\n");
  /** @type {any[]} */ const narrated = [];
  let done = false;
  const { port, token, close } = await start({ home, onWrite: (r) => narrated.push(...r), onDone: () => { done = true; } });
  const post = (route, body) => fetch(`http://127.0.0.1:${port}${route}?t=${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const answers = { ...DEFAULTS, name: "Gene", path: proj };
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/write`, { method: "POST", body: "{}" })).status, 403, "no token, no write");
    assert.equal((await post("/write", { answers: { nope: true } })).status, 400, "answers must carry a path");

    const plan = await (await post("/plan", { answers })).json();
    assert.equal(plan.ok, true);
    assert.equal(plan.files.find((/** @type {any} */ f) => f.name === "CLAUDE.md").existing, "# mine\n");
    assert.equal(await readFile(path.join(proj, "CLAUDE.md"), "utf8"), "# mine\n", "/plan wrote nothing");

    let out = await (await post("/write", { answers, decisions: { "CLAUDE.md": "keep" } })).json();
    assert.equal(out.ok, true);
    assert.equal(out.results.find((/** @type {any} */ r) => r.name === "CLAUDE.md").action, "kept");
    assert.equal(await readFile(path.join(proj, "CLAUDE.md"), "utf8"), "# mine\n");
    assert.match(await readFile(path.join(proj, "AGENTS.md"), "utf8"), /personalized for Gene/);
    assert.equal(narrated.length, 4, "the CLI was told about every file");

    out = await (await post("/write", { answers, decisions: { "CLAUDE.md": "overwrite" } })).json();
    assert.equal(out.results.find((/** @type {any} */ r) => r.name === "CLAUDE.md").action, "written");
    assert.equal(await readFile(path.join(proj, "CLAUDE.md"), "utf8"), await readFile(path.join(proj, "AGENTS.md"), "utf8"));

    assert.equal((await post("/done", {})).status, 200);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(done, true);
  } finally {
    close();
    await rm(home, { recursive: true, force: true });
    await rm(proj, { recursive: true, force: true });
  }
});
