// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DEFAULTS } from "../src/generate.js";
import { encodeProjectPath } from "../src/paths.js";
import { planWrite, applyWrite, atomicWrite } from "../src/write.js";
import { lineDiff } from "../src/diff.js";

const TODAY = "2026-09-21";

/** A throwaway home + project, with Claude Code's projects root present or not. */
async function sandbox({ claudeInstalled = true } = {}) {
  const home = await mkdtemp(path.join(tmpdir(), "hc-home-"));
  const proj = await mkdtemp(path.join(tmpdir(), "hc-proj-"));
  if (claudeInstalled) await mkdir(path.join(home, ".claude", "projects"), { recursive: true });
  const memoryDir = path.join(home, ".claude", "projects", encodeProjectPath(path.resolve(proj)), "memory");
  const answers = { ...DEFAULTS, name: "Gene", path: proj };
  const cleanup = async () => { await rm(home, { recursive: true, force: true }); await rm(proj, { recursive: true, force: true }); };
  return { home, proj, memoryDir, answers, cleanup };
}

/** @param {any} plan */
const okPlan = (plan) => { assert.equal(plan.ok, true, "plan should be ok"); return plan; };

test("atomicWrite: file lands whole, no temp file remains, parent dirs are created", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "hc-aw-"));
  try {
    const file = path.join(dir, "deep", "er", "x.md");
    await atomicWrite(file, "hello\n");
    assert.equal(await readFile(file, "utf8"), "hello\n");
    assert.deepEqual(await readdir(path.dirname(file)), ["x.md"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("fresh project: all four files written, AGENTS.md is byte-identical to CLAUDE.md", async () => {
  const s = await sandbox();
  try {
    const plan = okPlan(await planWrite(s.answers, { home: s.home, today: TODAY }));
    assert.equal(plan.files.length, 4);
    assert.ok(plan.files.every((f) => f.existing === null));
    const results = await applyWrite(plan, {});
    assert.deepEqual(results.map((r) => r.action), ["written", "written", "written", "written"]);
    const claude = await readFile(path.join(s.proj, "CLAUDE.md"), "utf8");
    assert.equal(await readFile(path.join(s.proj, "AGENTS.md"), "utf8"), claude);
    assert.match(claude, /personalized for Gene/);
    assert.match(await readFile(path.join(s.memoryDir, "MEMORY.md"), "utf8"), /Owner: Gene/);
    assert.match(await readFile(path.join(s.memoryDir, "PRIVATE-context-primer.md"), "utf8"), /Still learning/);
  } finally { await s.cleanup(); }
});

test("never clobber: an existing file is kept unless the decision says overwrite", async () => {
  const s = await sandbox();
  try {
    await writeFile(path.join(s.proj, "CLAUDE.md"), "# mine\n");
    let plan = okPlan(await planWrite(s.answers, { home: s.home, today: TODAY }));
    const claude = plan.files.find((f) => f.name === "CLAUDE.md");
    assert.equal(claude?.existing, "# mine\n");
    assert.equal(claude?.same, false);

    let results = await applyWrite(plan, {});                      // no decision -> keep
    assert.equal(results.find((r) => r.name === "CLAUDE.md")?.action, "kept");
    assert.equal(await readFile(path.join(s.proj, "CLAUDE.md"), "utf8"), "# mine\n");
    assert.equal(results.find((r) => r.name === "AGENTS.md")?.action, "written");

    results = await applyWrite(plan, { "CLAUDE.md": "keep" });     // explicit keep
    assert.equal(await readFile(path.join(s.proj, "CLAUDE.md"), "utf8"), "# mine\n");

    results = await applyWrite(plan, { "CLAUDE.md": "overwrite" }); // explicit overwrite
    assert.equal(results.find((r) => r.name === "CLAUDE.md")?.action, "written");
    assert.match(await readFile(path.join(s.proj, "CLAUDE.md"), "utf8"), /operating contract/);

    plan = okPlan(await planWrite(s.answers, { home: s.home, today: TODAY }));
    assert.ok(plan.files.every((f) => f.same), "second plan sees everything as already up to date");
    results = await applyWrite(plan, {});
    assert.ok(results.every((r) => r.action === "unchanged"));
  } finally { await s.cleanup(); }
});

test("CRLF on disk is not a difference", async () => {
  const s = await sandbox();
  try {
    let plan = okPlan(await planWrite(s.answers, { home: s.home, today: TODAY }));
    await applyWrite(plan, {});
    const file = path.join(s.proj, "CLAUDE.md");
    await writeFile(file, (await readFile(file, "utf8")).replace(/\n/g, "\r\n"));
    plan = okPlan(await planWrite(s.answers, { home: s.home, today: TODAY }));
    assert.equal(plan.files.find((f) => f.name === "CLAUDE.md")?.same, true);
  } finally { await s.cleanup(); }
});

test("no Claude Code memory root: private files are shown, not written; project files still land", async () => {
  const s = await sandbox({ claudeInstalled: false });
  try {
    const plan = okPlan(await planWrite(s.answers, { home: s.home, today: TODAY }));
    assert.equal(plan.memoryAvailable, false);
    assert.equal(plan.memoryDir, null);
    const results = await applyWrite(plan, {});
    const mem = results.find((r) => r.name === "MEMORY.md");
    assert.equal(mem?.action, "shown");
    assert.match(mem?.text ?? "", /Owner: Gene/);
    assert.equal(results.find((r) => r.name === "CLAUDE.md")?.action, "written");
    assert.deepEqual((await readdir(s.home)), [], "nothing was written under home");
  } finally { await s.cleanup(); }
});

test("memory-dir override is honoured and used as the jail root", async () => {
  const s = await sandbox({ claudeInstalled: false });
  const elsewhere = await mkdtemp(path.join(tmpdir(), "hc-mem-"));
  try {
    const plan = okPlan(await planWrite(s.answers, { home: s.home, today: TODAY, memoryDir: elsewhere }));
    assert.equal(plan.memoryDir, path.resolve(elsewhere));
    await applyWrite(plan, {});
    assert.match(await readFile(path.join(elsewhere, "MEMORY.md"), "utf8"), /Owner: Gene/);
  } finally { await s.cleanup(); await rm(elsewhere, { recursive: true, force: true }); }
});

test("path jail: a planned path outside its root is refused before anything is opened", async () => {
  const s = await sandbox();
  const outside = await mkdtemp(path.join(tmpdir(), "hc-out-"));
  try {
    const plan = okPlan(await planWrite(s.answers, { home: s.home, today: TODAY }));
    const tampered = { ...plan, files: plan.files.map((f) => f.name === "CLAUDE.md" ? { ...f, path: path.join(outside, "CLAUDE.md") } : f) };
    await assert.rejects(() => applyWrite(tampered, {}), /refusing to write outside/);
    assert.deepEqual(await readdir(outside), []);
  } finally { await s.cleanup(); await rm(outside, { recursive: true, force: true }); }
});

test("notes off: only the two project files are planned", async () => {
  const s = await sandbox();
  try {
    const plan = okPlan(await planWrite({ ...s.answers, memory: false }, { home: s.home, today: TODAY }));
    assert.deepEqual(plan.files.map((f) => f.name), ["CLAUDE.md", "AGENTS.md"]);
  } finally { await s.cleanup(); }
});

test("a missing project folder yields a plan that is not ok, and writes nothing", async () => {
  const s = await sandbox();
  try {
    const plan = await planWrite({ ...s.answers, path: path.join(s.proj, "nope") }, { home: s.home });
    assert.equal(plan.ok, false);
  } finally { await s.cleanup(); }
});

test("lineDiff: marks changed lines and keeps the rest", () => {
  const d = lineDiff("a\nb\nc\n", "a\nB\nc\nd\n");
  assert.deepEqual(d.map((l) => l.t + l.s), [" a", "-b", "+B", " c", "+d", " "]);
  assert.ok(lineDiff("same\n", "same\n").every((l) => l.t === " "));
});
