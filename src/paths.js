// @ts-check
// Where things go. The project dir is the user's; the memory dir is a guess about Claude Code's
// internals, and is labelled as such everywhere it surfaces.

import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/** Files this tool writes into the project root. */
export const PROJECT_FILES = ["CLAUDE.md", "AGENTS.md"];
/** Files this tool writes into the memory dir. */
export const MEMORY_FILES = ["MEMORY.md", "PRIVATE-context-primer.md"];

/**
 * Claude Code keeps per-project memory at ~/.claude/projects/<encoded>/memory, where <encoded>
 * is the absolute project path with every non-alphanumeric character replaced by "-".
 *
 * ⚠ NAMED DEPENDENCY (observed 2026-09-16 against Claude Code on Windows and confirmed on a
 * dozen real project dirs; e.g. "D:\Claude Development\hello-claude" ->
 * "D--Claude-Development-hello-claude"). This is undocumented and may change without notice.
 * Everything that uses it treats it as a guess: labelled, overridable, with a fallback.
 * @param {string} absProjectPath
 */
export function encodeProjectPath(absProjectPath) {
  return absProjectPath.replace(/[^A-Za-z0-9]/g, "-");
}

/**
 * Resolve what the user typed into an absolute path. Expands a leading "~".
 * @param {string} input
 * @param {{ home?: string }} [opts]
 */
export function resolveProjectPath(input, opts = {}) {
  const home = opts.home ?? homedir();
  const t = input.trim();
  const expanded = t === "~" ? home : t.startsWith("~/") || t.startsWith("~\\") ? path.join(home, t.slice(2)) : t;
  return path.resolve(expanded);
}

/**
 * The memory dir Claude Code would use for a project, and whether Claude Code seems to be
 * installed at all (its projects root exists). When it isn't, nothing private is written —
 * the files are shown for the user to place by hand (SPEC: memory-dir fallback).
 * @param {string} absProjectPath
 * @param {{ home?: string }} [opts]
 */
export async function memoryDirFor(absProjectPath, opts = {}) {
  const home = opts.home ?? homedir();
  const projectsRoot = path.join(home, ".claude", "projects");
  const dir = path.join(projectsRoot, encodeProjectPath(path.resolve(absProjectPath)), "memory");
  return { dir, available: await exists(projectsRoot), convention: "claude-code" };
}

/** @param {string} p */
export async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/** @param {string} p */
export async function isDirectory(p) {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

/**
 * Everything the wizard needs to know about a target before it writes anything.
 * @param {string} input   what the user typed
 * @param {{ home?: string, memoryDir?: string }} [opts]  memoryDir: the user's override, if any.
 */
export async function checkTarget(input, opts = {}) {
  if (!input.trim()) return { ok: false, reason: "empty" };
  const resolved = resolveProjectPath(input, opts);
  if (!(await isDirectory(resolved))) return { ok: false, reason: "missing", resolved };

  const guess = await memoryDirFor(resolved, opts);
  const override = (opts.memoryDir ?? "").trim();
  const memory = override
    ? { dir: resolveProjectPath(override, opts), available: true, convention: "override", guess: guess.dir }
    : { ...guess, guess: guess.dir };
  /** @type {Record<string, boolean>} */
  const existing = {};
  for (const f of PROJECT_FILES) existing[f] = await exists(path.join(resolved, f));
  for (const f of MEMORY_FILES) existing[f] = memory.available && (await exists(path.join(memory.dir, f)));

  return {
    ok: true,
    resolved,
    isGitRepo: await exists(path.join(resolved, ".git")),
    memory,
    existing,
  };
}
