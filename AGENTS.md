# Master AI workspace contract

Control plane for several unrelated projects. Not a monorepo. It holds preferences,
safety, routing, context, memory and handoff policy only; technical facts belong to one project.

Claude Code reads this through `CLAUDE.md`, Codex directly. Both do the same engineering work
under the same rules; there are no planner/implementer roles.

## Routing

1. The first sentence names the project. Resolve it against `workspace.yaml` by `id` or `alias`.
   With no name, resolve from the working directory.
2. Read that project's `<project>/AGENTS.md`.
3. Choose ONE primary repository and say which.
4. Read that repository's own guide. Read its `docs/` only for a named topic.
5. Never open a second project. Cross-repository work stays inside one project and needs proven
   evidence: an API contract, shared configuration, a generated client, a Docker seam, or a shared
   package. A guess is not evidence.

Precedence, most specific wins: repository guide, project contract, this file — except for
safety, git, privacy and output rules, where this file always wins.

## Where standards live

`AGENTS.md` and `CLAUDE.md` resolve upward, so a session started in a repository loads the
repository guide, the project contract, this file and the host adapter together.

A repository's own `.claude/` — `skills/`, `agents/`, `hooks/`, `settings.json` — is read ONLY from
the session's starting directory, never upward or downward. Starting at this root silences every
team skill, sub-agent and hook a repository ships, and those are binding standards.

Start the session inside the repository you are changing. When that did not happen, the project
card names the repositories whose standards are currently inert: read those files directly before
changing that repository, and say that you did.

Work from this root only for control-plane work: registry, skills, memory vault, contracts.

## Hard rules

- Git mutations need an explicit request in the current turn. Reads are free; branch, checkout,
  stage, commit, push, stash, reset, pull and remote changes are not. Output the command as text.
- Never write explanatory comments into code. Names and tests are the explanation.
- Never print a secret value. Output the command that retrieves it.
- Commit messages, identifiers and application logs are English. No `Co-Authored-By` trailers.
- Preserve unrelated staged, unstaged and untracked changes in every repository.
- Environment and infrastructure variables change only through explicit per-value consent; a
  deploy request is not that consent.

## Context budget

Always loaded: this file, the active project contract, the memory index. The rest is on demand.

- Progressive disclosure: task terms, project contract, repo guide, at most three targeted memory
  hits, relevant files, direct callers and tests. Widen for a named unanswered question.
- Never preload the vault, every skill body, every repo guide, raw graph JSON, logs or transcripts.
- Keep model-visible output near 4 KB.
- A tool round replays the whole conversation, so rounds cost far more than tool calls. When two
  or more checks are already known and independent, issue them in one message. Never skip, delay
  or shrink a check to lower the count: an unanswered question costs more than a round.
- Around ten rounds on one question, say what is still unknown and re-plan. A checkpoint, not a
  cap, and never a reason to answer from a guess.
- Fresh chat per distinct task; when a phase turns noisy, write a compact handoff instead.

## Memory

`memory/` here is the single canonical store for Claude, Codex and anyone who clones this
workspace. Claude's native memory directory is a symlink into it and notes carry both schemas at
once, so writing memory the normal way lands in the repository.

`00-profile/` preferences. `10-workspace/` this control plane. `15-colleagues/` minimal verified
company directory. `20-projects/<id>/` project facts. `30-tasks/<id>/` anchors and
review ledgers. `40-patterns/` cross-project lessons. `90-inbox/` unverified. Team knowledge
stays in its repository; link it.

A verified correction produces exactly one narrow durable change, preferred in this order:
regression test, repository guide, project contract, rule, skill, memory note. Show the path.
No guesses, secrets or transcripts.

## Deliverables and verification

Markdown and repository-native files by default; no HTML artifacts or previews unless asked.
Browser automation only when source and tests cannot answer, one screenshot per state. Verify in
proportion to risk; report outcome, changed files, what was checked, what was skipped and the
remaining risk. If tests fail, say so with the output.

## Hooks

Hooks inject the project card once per project switch and warn as context grows. Observability
and routing only: they never deny a tool, force a skill or block completion.
