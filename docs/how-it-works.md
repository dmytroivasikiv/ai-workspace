# How the workspace works

The root contract defines safety, routing, memory, and context rules. `workspace.yaml` maps a project name to one or more related repositories. Repository guides contain the commands and standards that only that codebase needs.

Claude and Codex share `AGENTS.md`, the skills under `.ai/skills/`, and the Markdown vault under `memory/`. Claude receives lifecycle hooks through the user adapter installed by `./bin/aiw setup --user-adapters`. Codex receives the same operating contract through its user `AGENTS.md` adapter.

QMD indexes global memory plus the selected project's notes. The hook and search command return at most three relevant notes. Graphify stays off until a call-path, architecture, or blast-radius question needs it. Obsidian opens `memory/` as a human-readable view of the same files.

The root `.claude/settings.json` intentionally has no lifecycle hooks. A project-level hook only runs when Claude starts in that directory. Installing the shared lifecycle hook at user level makes routing and context warnings work from every registered repository without duplicating them.
