@AGENTS.md

# Claude adapter

Shared skills live in `.ai/skills/` and are linked into `~/.claude/skills`, so they load from any
working directory. Use `workspace-task-start` for an unfamiliar, ambiguous, multi-file or continued
task; `qmd` for a named memory question; `workspace-code-graph` only for architecture, call paths
or blast radius that direct search cannot answer; `workspace-review-pr`, `workspace-handoff`,
`workspace-memory-update` and `workspace-wrap-up` for their named phases.

A repository's own `.claude/skills`, `.claude/agents` and `.claude/hooks` load only when the
session started inside that repository. The project card says which ones are inert; read those
files directly rather than assuming the standards do not exist.

Memory is written the normal way and lands in `memory/` in this repository, because the native
memory directory is a symlink into it. Notes carry the native and the durable schema together;
`scripts/memory-index` normalizes and re-indexes them.

For a named continuation, search `memory/30-tasks/<project>/` before investigating anything. For a
repeat review, reconcile the existing review ledger before reporting findings again.
