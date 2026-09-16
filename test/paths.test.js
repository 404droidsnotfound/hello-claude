// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { encodeProjectPath, resolveProjectPath, memoryDirFor, checkTarget } from "../src/paths.js";

test("encodes a project path the way Claude Code names its memory dirs", () => {
  // Observed 2026-09-16 against real ~/.claude/projects entries.
  assert.equal(encodeProjectPath(String.raw`D:\Claude Development\hello-claude`), "D--Claude-Development-hello-claude");
  assert.equal(encodeProjectPath("/home/gene/my proj"), "-home-gene-my-proj");
  assert.equal(encodeProjectPath(String.raw`C:\a.b_c`), "C--a-b-c");
});

test("resolves ~ against the given home", () => {
  const home = path.resolve("/fake/home");
  assert.equal(resolveProjectPath("~/proj", { home }), path.join(home, "proj"));
  assert.equal(resolveProjectPath("~", { home }), home);
  assert.equal(resolveProjectPath("  /abs/x  ", { home }), path.resolve("/abs/x"));
});

test("memory dir: available only when Claude Code's projects root exists", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "hc-home-"));
  try {
    const before = await memoryDirFor("/p/q", { home });
    assert.equal(before.available, false);
    await mkdir(path.join(home, ".claude", "projects"), { recursive: true });
    const after = await memoryDirFor("/p/q", { home });
    assert.equal(after.available, true);
    assert.equal(after.dir, path.join(home, ".claude", "projects", encodeProjectPath(path.resolve("/p/q")), "memory"));
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("checkTarget reports missing, existing files, and git status", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "hc-home-"));
  const proj = await mkdtemp(path.join(tmpdir(), "hc-proj-"));
  try {
    assert.deepEqual(await checkTarget("   ", { home }), { ok: false, reason: "empty" });
    const missing = await checkTarget(path.join(proj, "nope"), { home });
    assert.equal(missing.ok, false); assert.equal(missing.reason, "missing");

    let c = await checkTarget(proj, { home });
    assert.equal(c.ok, true);
    assert.equal(c.isGitRepo, false);
    assert.equal(c.existing?.["CLAUDE.md"], false);
    assert.equal(c.memory?.available, false);

    await mkdir(path.join(proj, ".git"));
    await writeFile(path.join(proj, "CLAUDE.md"), "# old\n");
    await mkdir(path.join(home, ".claude", "projects"), { recursive: true });
    c = await checkTarget(proj, { home });
    assert.equal(c.isGitRepo, true);
    assert.equal(c.existing?.["CLAUDE.md"], true);
    assert.equal(c.existing?.["AGENTS.md"], false);
    assert.equal(c.memory?.available, true);
    assert.equal(c.existing?.["MEMORY.md"], false);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(proj, { recursive: true, force: true });
  }
});
