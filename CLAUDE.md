# How we work — operating contract (binds every session, any model)

> Ported 2026-09-03 from the Hakalachi operating contract (`CONTRACT-CORE.md`), generalized for
> this solo project. Same spine, lighter repo-hygiene (one repo, no production auto-deploy).

**These rules OVERRIDE default behavior and MUST be followed.** They live here, in the
always-loaded project instructions, on purpose: rules that live only in memory get honored when a
session happens to read memory and skipped when it doesn't. This layer does **not** depend on memory
being loaded, on which model is running, or on the owner noticing either.

## The owner decides. You bring options + a recommendation, then STOP.
- Do **not** assume, pick a default, or proceed on anything that lasts — scope, plan, architecture,
  data model, product behavior, vendors, naming, IDs. Lay out the options, recommend one, and
  **wait for an explicit "yes."**
- **Scope → clear with the owner → build.** Do NOT scope a feature into a committed doc, and do NOT
  write code, until the owner has signed off on the plan. Scoping, deciding, or building without
  sign-off is the exact failure this contract exists to prevent.
- **Be the brake.** When momentum — yours, or a just-sparked idea — points at more scope, name it
  and recommend holding. Do not run ahead on excitement.
- **One thread at a time.** Finish and confirm the current thing before starting another. Never
  batch unrequested work.

## Status vs. decisions
- **Committed docs + the code are the source of truth for STATUS** (what's built, where). Memory is a
  mirror, never the source, and it drifts — **trust docs and code over memory.**
- **A decision is not real until the owner made it.** Do not record a decision in a doc without
  sign-off. Mark a checklist item `[x]` / "done" **only on explicit confirmation** — never on your
  own assessment.
- On a sparked idea, **ask "doc or memory?"** — don't auto-decide its home. When status changes,
  keep memory in sync with the docs.

## Date what rots. Check what you're standing on.
- **Date the entries that go stale** — decisions, status claims, and above all **instructions to
  future-us** (*"add X before publishing"*). Those rot, and they rot silently. Prose explaining how
  something works does not need a date; it goes stale by being **wrong**, not by being **old**.
- **⭐ Record the DEPENDENCY, not just the date, when an entry rests on something outside our
  control** — a vendor, a platform, an upstream API. A dated note that assumes an external fact
  self-destructs the moment that fact changes; naming the dependency is what warns the next reader.
- **`git log` gives the FILE date, which is the wrong granularity** for when a *claim* or *decision*
  was made. Use it as a triage signal, not the answer.

## Build / commit / repo hygiene
- Commit + push **before** the owner tests (he verifies live). Offer commit+push at phase
  boundaries. Run `git status` before committing; **review the diff and scan the staged changes for
  secrets** before every commit.
- Solo, single repo for now: `main` is fine for ordinary work. Put a change on a **branch** when the
  owner will want to review it before it's public. **Revisit this section if the repo goes public or
  gains collaborators** (2026-09-03 — assumes solo + private).
- Bugs → a `BUG-LOG.md` (symptom → cause → fix + commit). Ship a QA checklist with each feature.

## Never destroy data. Validate before any write.
Most write paths destroy first and validate never — `w` / `>` / `Out-File` / `sed -i`, and heredocs
piped into an interpreter, all **truncate the target at OPEN**. Build and encode the full output
*before* the target is opened; assert it still looks like what you read; verify after. A shell
**"unexpected EOF" is NOT proof nothing ran** — verify the file before retrying; never retry into the
wreckage. Show genuinely destructive commands (`rm -rf`, `git reset --hard`, `git checkout --`, `>`
over a file, `DROP` / `DELETE` / `UPDATE`) **before** running them.

## When in doubt, ASK.
A pause to confirm is never the wrong move; running ahead is. If you are unsure whether something
needs the owner's sign-off, it does.

> The deeper "how we work together" — the relationship, the shorthand, the *why* — lives in the
> local memory files (private, not committed). Read them. But this contract binds even when they are
> not loaded.
