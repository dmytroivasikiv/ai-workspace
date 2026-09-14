# AI workspace kit

A ready-to-clone control plane for Claude Code and Codex. It reduces repeated context through scoped memory retrieval, project isolation, reusable skills, and advisory lifecycle hooks without forcing a cheaper model or lower reasoning.

The repository includes two synthetic projects, six fictional colleagues, project memory, a task handoff, runnable tests, a repository-local Claude hook and skill, an Obsidian vault, QMD integration, and on-demand Graphify commands.

## Quick start

Requirements: Git, Python 3.10+, Node.js 20+, and QMD.

```bash
npm install -g @tobilu/qmd@2.5.3
./bin/aiw setup
./bin/aiw demo
```

Optional tools:

```bash
uv tool install graphifyy==0.9.27
```

To build the optional semantic index after QMD downloads its local model, run `./bin/aiw setup --semantic`.

Open `memory/` as an Obsidian vault if you want the visual knowledge view.

## Enable Claude and Codex everywhere

Preview the user-level changes:

```bash
./bin/aiw adapters
```

Then install the shared rules, skills, Claude output style, lifecycle hooks, and stable helper commands once per machine:

```bash
./bin/aiw setup --user-adapters
```

The installer preserves existing Claude and Codex rule files, merges Claude settings, and creates a settings backup. Root `.claude/settings.json` intentionally has no shared hooks: project hooks only load from the session's starting directory, while the installed user hook works from every registered repository.

## Add a local project

Keep repositories beside this workspace or elsewhere on your machine. Their paths live in ignored `workspace.yaml`, never in the public template.

```bash
./bin/aiw add-project billing billing-api ../billing-api   --role "API" --domain "billing" --alias "payments" --team
```

The command registers the repository, creates memory folders, refreshes QMD, and rebuilds the Obsidian project map. Add more related repositories with the same project ID. Keep unrelated products under different IDs.

## Daily commands

```bash
./bin/aiw status
./bin/aiw context shop "order summary contract"
./bin/aiw memory-search shop "order summary contract"
./bin/aiw graph status shop-api
./bin/aiw graph build shop-api
./bin/aiw doctor
./bin/aiw doctor --strict
```

## Repository map

- `AGENTS.md` — shared contract read by Codex and imported by Claude.
- `CLAUDE.md` — thin Claude adapter.
- `workspace.yaml.example` — safe registry template; `workspace.yaml` is local and ignored.
- `.ai/skills/` — reusable workflows linked into Claude and Codex.
- `scripts/claude-hook.mjs` — routing, memory hits, handoffs, and context warnings.
- `memory/` — one Markdown and Obsidian vault shared by both agents.
- `scripts/memory-*` — validation, QMD collections, retrieval, and indexing.
- `scripts/code-graph` — isolated Graphify graphs created only when needed.
- `demo-projects/` — synthetic repositories and repository-local Claude examples.
- `docs/demo-uk.md` — a short presentation walkthrough.

## Verification

```bash
./bin/aiw ci-check
make test
./bin/aiw test
./bin/aiw doctor
```

The portable checks and demo tests run in GitHub Actions without secrets. The default doctor keeps missing or differently installed machine adapters as warnings. Run `./bin/aiw doctor --strict` after `./bin/aiw setup --user-adapters` when you want every local integration to be mandatory.

## Privacy

The committed files contain only synthetic data. Local QMD indexes, graphs, task state, inbox captures, Obsidian window state, and `workspace.yaml` are ignored. Review new memory before committing it and never store secrets, private conversations, raw logs, or personnel assessments.
