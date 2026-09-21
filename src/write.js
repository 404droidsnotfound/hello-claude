// @ts-check
// The only code in Hello Claude that touches the user's disk.
//
//   - a plan is computed first and shown to the user: every path, and for anything already
//     there, the current content so the page can show a diff
//   - nothing existing is replaced without an explicit per-file "overwrite"
//   - every write is tmp -> fsync -> rename, so a crash mid-write leaves the old file intact
//   - every path is checked to live under the project dir or the memory dir before it is
//     opened — a jail, so a bad override can't aim a write elsewhere

import { open, rename, unlink, mkdir, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { generateDocs, docToText } from "./generate.js";
import { checkTarget, memoryDirFor, resolveProjectPath, exists, PROJECT_FILES, MEMORY_FILES } from "./paths.js";

/**
 * @typedef {{ name: string, kind: "project" | "memory", path: string | null, text: string,
 *             existing: string | null, same: boolean }} PlannedFile
 */

/**
 * Work out everything that would be written, and read what is already there.
 * Writes nothing.
 * @param {import("./generate.js").Answers} answers
 * @param {{ memoryDir?: string, home?: string, today?: string }} [opts]
 *   memoryDir: user override for where the private files go ("" = use the guess).
 */
export async function planWrite(answers, opts = {}) {
  const check = await checkTarget(answers.path, opts);
  if (!check.ok || !check.resolved) return { ok: false, reason: check.reason ?? "missing" };
  const projectDir = check.resolved;

  const override = (opts.memoryDir ?? "").trim();
  const guess = await memoryDirFor(projectDir, opts);
  const memoryDir = override ? resolveProjectPath(override, opts) : guess.available ? guess.dir : null;

  const docs = generateDocs(answers, opts);
  const contract = docToText(docs.contract);
  /** @type {PlannedFile[]} */
  const files = [];
  for (const name of PROJECT_FILES) files.push(await planned(name, "project", path.join(projectDir, name), contract));
  if (answers.memory && docs.memory && docs.primer) {
    /** @type {Record<string, string>} */
    const texts = { "MEMORY.md": docToText(docs.memory), "PRIVATE-context-primer.md": docToText(docs.primer) };
    for (const name of MEMORY_FILES)
      files.push(await planned(name, "memory", memoryDir ? path.join(memoryDir, name) : null, texts[name]));
  }
  return { ok: true, projectDir, memoryDir, memoryGuess: guess.dir, memoryAvailable: guess.available, files };
}

/**
 * @param {string} name
 * @param {"project"|"memory"} kind
 * @param {string|null} file
 * @param {string} text
 * @returns {Promise<PlannedFile>}
 */
async function planned(name, kind, file, text) {
  const existing = file && (await exists(file)) ? await readFile(file, "utf8") : null;
  return { name, kind, path: file, text, existing, same: existing !== null && normalise(existing) === normalise(text) };
}

/** Line endings differ by editor and OS; they are not a difference worth a diff. @param {string} s */
const normalise = (s) => s.replace(/\r\n/g, "\n");

/** @typedef {Extract<Awaited<ReturnType<typeof planWrite>>, { ok: true }>} Plan */
/** @typedef {{ name: string, path: string | null, action: "written" | "kept" | "unchanged" | "shown", text?: string }} WriteResult */

/**
 * Carry out a plan. A file that already exists is written only when decisions[name] is
 * "overwrite"; a file with no path (no memory dir) is returned for the user to place by hand.
 * @param {Plan} plan
 * @param {Record<string, "overwrite" | "keep">} decisions
 * @returns {Promise<WriteResult[]>}
 */
export async function applyWrite(plan, decisions) {
  /** @type {WriteResult[]} */
  const results = [];
  for (const f of plan.files) {
    if (!f.path) { results.push({ name: f.name, path: null, action: "shown", text: f.text }); continue; }
    if (f.existing !== null && f.same) { results.push({ name: f.name, path: f.path, action: "unchanged" }); continue; }
    if (f.existing !== null && decisions[f.name] !== "overwrite") { results.push({ name: f.name, path: f.path, action: "kept" }); continue; }
    assertInside(f.path, f.kind === "project" ? plan.projectDir : plan.memoryDir);
    await atomicWrite(f.path, f.text);
    results.push({ name: f.name, path: f.path, action: "written" });
  }
  return results;
}

/**
 * @param {string} file
 * @param {string | null} root
 */
function assertInside(file, root) {
  if (!root) throw new Error(`refusing to write ${file}: no root directory`);
  const rel = path.relative(path.resolve(root), path.resolve(file));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`refusing to write outside ${root}: ${file}`);
}

/**
 * Write the whole file to a sibling temp file, fsync it, then rename over the target.
 * @param {string} file
 * @param {string} text
 */
export async function atomicWrite(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  const fh = await open(tmp, "w");
  try {
    await fh.writeFile(text, "utf8");
    await fh.sync();
  } finally { await fh.close(); }
  try { await rename(tmp, file); }
  catch (err) { await unlink(tmp).catch(() => {}); throw err; }
}
