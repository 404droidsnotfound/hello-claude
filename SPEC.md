# Hello Claude — spec

A local tool that interviews you about how you like to work and writes the files an AI coding
assistant reads at the start of every session — so a fresh Claude / Claude Code repo starts already
armed with your operating contract, instead of on day one of the job.

Decisions in this file are dated. A dated line is a claim that can rot; an undated line is prose
that goes stale by being wrong, not by being old. When code and this doc disagree, one of them is
defective — fix it in the same change.

## What it is (locked 2026-09-03)

- **A local runner** (`npx hello-claude`) that opens a web interview in the browser. Not a static
  page: it must write files to a user-given path, including a hidden memory directory, which a
  sandboxed browser cannot do.
- **Deterministic templating.** Answers fill slots in an opinionated skeleton. Offline, private, no
  API key, cannot hallucinate a rule. An optional LLM "interview me" mode is a **later** phase and
  uses the user's own key; the form version ships first.
- **One project per run.** Multi-repo composition is a future "advanced" mode.
- **Never clobber.** Detect existing files, show a diff, ask before overwriting.
- **Public / open source.** Nothing personal lives in this repo.

## What it writes

Two kinds of file, with a hard line between them:

| File | Where | Holds | Visibility |
|---|---|---|---|
| `CLAUDE.md` | project root | the **rules** — the operating contract | committed, public |
| `AGENTS.md` | project root | the same contract, for tools that look for that name | committed, public |
| `MEMORY.md` | the project's Claude memory dir | a ten-line **CORE** block that re-associates a fresh session, plus an index | private, never committed |
| `PRIVATE-context-primer.md` | the project's Claude memory dir | the **person** — who they are, how you work together, what is still unknown | private, never committed |

The contract binds even when memory does not load; it says so, and it ends by telling the session to
read the primer. The primer is where rapport accumulates. Rules go in the contract; the person goes
in the primer; nothing personal crosses into the committed files.

The memory files are only written when the user keeps notes (the "Notes" toggle). When they don't,
the interview asks nothing personal beyond a name: the role and expertise fields are hidden, because
there would be no private place to put the answers and the contract must not become one
(decided 2026-09-15).

## The content is earned (2026-09-15)

The wizard cannot build rapport. Everything in a good primer that actually matters — the shorthand,
the habits, "says PST but means UTC−7" — was learned by working together, not typed into a form on
day one. So the wizard's job for the primer is deliberately small:

1. **Seed the container** with what the user can honestly say up front (name, role, expertise,
   tone, how they want decisions handled).
2. **Make the blanks visible** — a *Still learning* section whose empty lines are a checkable list
   of what the assistant does not yet know.
3. **Instruct the session to fill them** — the rule below.

The form does not try to ask the questions a colleague would ask in the first week. It arranges for
those questions to be asked *in* the first week.

## The "get to know the owner" rule (2026-09-15)

A third toggle on the Notes step, shown only when notes are on, default **on**:

> *Let Claude ask me a few questions over the first sessions to learn how I work.*

When on, the generated contract carries this section:

```markdown
## Get to know the owner (until you do)
- The private primer has a **"Still learning"** section. While anything in it is
  blank, you are new here — so at natural pauses (a task just finished, a wait),
  ask **one** question that would fill a blank. Never a questionnaire; never
  before the work they came for.
- Ask what a good colleague would want to know in the first week: how they like
  to be talked to, what humor lands, what wastes their time, the words and
  shorthand they use, when they're working, how they want to be told they're wrong.
  Pick the question from what's still blank — don't run a script.
- Write what you learn into the primer the same session. Once nothing is blank,
  stop asking and just *use* it. If they say "stop asking", stop — and note that.
- If there is no memory dir (another tool, a fresh machine), ask where to keep
  notes instead of asking nothing.
```

and the generated primer carries the section it fills:

```markdown
## Still learning  (blank = ask; filled = use)
- Talks to me like:
- Humor:
- Wastes their time:
- Their words / shorthand:
- Hours & timezone:
- Wants correction delivered:
```

Design points, in order of importance:

- **One question per pause.** Not "some questions." A five-question opener is the interrogation this
  tool exists to avoid; a colleague learns by working alongside you. (Owner's explicit brake,
  2026-09-15.)
- **"Am I still new here?" is a check, not a judgment.** The blanks are visible in the primer, so
  the session reads whether to ask rather than deciding whether to. This is what stops the rule
  becoming the opposite failure — day one, every day.
- **The rule lives in the contract, the blanks live in the primer.** The contract binds regardless
  of memory loading; the primer is where the answers can be private.
- **It ends.** Filled blanks, or "stop asking", both end it — and "stop asking" is itself recorded.
- **When the toggle is off**, the primer is still written but without the *Still learning* section,
  and the contract carries no rule. Nothing sits blank forever.

## Build order (locked 2026-09-03)

1. **Prototype** — a single-file web wizard that runs the full interview and renders every output
   live. Its generation logic is the reference the runner implements.
2. **Form-core runner** — Node; wraps the prototype's generation, writes the files, never-clobber,
   memory-dir fallback.
3. **"Interview me" mode** — optional, user's own API key.
4. **README as-built** — setup, usage, how it works.

## Status

- **2026-09-03** — scope locked. Prototype built and refined: welcome, plain-language pass, Browse
  button, "This project" step.
- **2026-09-15** — prototype walkthrough completed by the owner; judged solid. Gap found: the
  private primer was promised on two steps and generated on none. Spec'd above; prototype being
  extended to generate `MEMORY.md` + primer and carry the get-to-know rule; the "new or unusual?"
  question dropped; role/expertise hidden when notes are off. **Runner scoped and approved** (section
  above).
- **2026-09-16** — runner step 1 done: `npx hello-claude` serves the wizard from `web/` on a
  token-gated localhost port and opens the browser. `prototype/` is gone; `web/index.html` is the
  app. Nothing writes yet.
- **2026-09-16** — runner step 2 done: generation lives in `src/generate.js`, imported by the page
  for the preview and by Node for tests (`npm test`, 7 cases). The page no longer contains a generator.

## The runner (scoped and approved 2026-09-15)

```
npx hello-claude
   |
   +- starts a tiny HTTP server on 127.0.0.1:<random port>
   +- opens the browser at http://127.0.0.1:<port>/?t=<one-time token>
   |
   |   browser (the wizard)
   |     +- GET  /                -> the wizard page
   |     +- POST /check  {path}   -> folder exists? git repo? where memory would go
   |     +- POST /write  {answers, per-file decisions}
   |              -> generates all four files, never-clobber, atomic write, reports what landed
   |
   +- results screen: what was written where, "open the project in Claude Code"; server exits
```

**Decisions:**

1. **Zero dependencies, plain Node** (`node:http`, `node:fs`, `node:test`). No framework, no
   bundler, no build step; the wizard is one HTML file. Every dependency is startup time and audit
   surface for a tool whose value is "npx and it runs." Node 20+.
2. **JavaScript with `// @ts-check` and JSDoc**, not TypeScript. Editor-time type checking with
   nothing to compile.
3. **Generation lives in one shared ESM module**, `src/generate.js`, imported by the server and
   loaded by the wizard page as a module. One source of truth, unit-testable without a browser, and
   the live preview stays live. The prototype's `genContract` / `genMemory` / `genPrimer` become
   this module.
4. **Path entry: typed, with live validation.** `/check` confirms the folder exists, whether it is
   a git repo, and which memory dir would be used. A native folder picker has no dependency-free,
   cross-platform answer from Node; it is a *Later* item, not a v1 one.
5. **Memory-dir fallback:** when `~/.claude/projects` is not found, the results screen shows the
   two private files with the path that would have been used and a Copy button, and writes nothing
   private. Never into the repo — "private" and "in the repo" are the two things this design keeps
   apart, and a `.gitignore` line is not a wall.
6. **`prototype/` becomes `web/`.** The prototype is the app; a kept copy is a stale second
   rendering.

**Non-negotiables:**

- Binds `127.0.0.1` only. A one-time token, generated at start and carried in the URL, is required
  on every POST — without it any page open in the user's browser could write to their disk through
  localhost.
- Writes only under the chosen project dir and the computed memory dir. Every write is
  `<file>.tmp` → `fsync` → rename.
- An existing file is never touched until the user has seen the diff and chosen, per file,
  overwrite or keep.
- `AGENTS.md` is byte-identical to `CLAUDE.md`.

**Build order** (each step runnable end to end, each its own commit):

1. `package.json` + `bin/hello-claude.js` + server serving the wizard and opening the browser.
   Nothing writes yet.
2. Generation moved into `src/generate.js` with tests; the wizard imports it.
3. `/check`: path validation, memory-dir encoding, tests.
4. `/write`: never-clobber diff, atomic write, token check, results screen.
5. `README.md` as-built: install, run, what it writes where, how it works.

Layout: `bin/`, `src/` (`server.js`, `generate.js`, `paths.js`, `write.js`), `web/index.html`,
`test/`. `package.json` carries `bin`, `files`, `engines`, `"type": "module"`.

## Later (ideas captured, not scoped)

Nothing here is committed. Each line is dated so a reader knows how old the idea is; none of them
are being built until the form-core runner and README exist.

- **Import an existing contract.** Point the tool at a `CLAUDE.md` / `AGENTS.md` you already have
  and carry it into a new project — pre-filling the interview from it, or copying it through and
  asking only what's project-specific. Would make the tool the way you *propagate* a contract you
  have refined, not just the way you write a first one. *(2026-09-15)*
- **"Interview me" mode.** Claude conducts the interview conversationally, using the user's own API
  key. Locked as a later phase, not an idea — listed here so the list is complete. *(2026-09-03)*
- **Native folder picker** for the path field, per OS (PowerShell dialog / `osascript` / `zenity`),
  falling back to the typed path. *(2026-09-15)*
- **Multi-repo compose.** One contract core, several repos. Locked as a future "advanced" mode.
  *(2026-09-03)*

## Named dependencies

- **The memory-dir path** is computed from Claude Code's internal
  `~/.claude/projects/<encoded-project-path>/memory` convention. This is undocumented and may
  change without notice. The runner must label it as a guess, let the user override it, and fall
  back gracefully (a gitignored file in the repo, or print the content for manual placement).
  *(Recorded 2026-09-03 — assumes Claude Code's convention as of that date.)*

## Open questions

- **Where `AGENTS.md`-only tools keep memory.** The rule's last bullet covers it at runtime; the
  runner's fallback covers it at write time. Whether that is enough is untested.

## Non-goals

- Not a general prompt generator. It produces one specific, opinionated kind of file.
- Not a memory system. It seeds the files Claude Code already reads; it does not run between
  sessions.
- No cloud, no accounts, no telemetry.
