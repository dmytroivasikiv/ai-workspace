---
name: workspace-handoff
description: Create or update a compact continuation anchor when work will continue in another Claude Code or Codex session, especially after a coherent phase of complex debugging, migration, or implementation.
---

# Create a handoff

Write `memory/30-tasks/<project-id>/<task-id>.md` from the task template. Capture goal, primary project/repo, current state, verified facts, user corrections, rejected approaches, changed files, checks, decisions, remaining work, and one exact next action.

Target about 800 tokens and never exceed about 1500 except for genuinely complex debugging. Update the same file; do not append chat history, raw logs, secrets, or large diffs. The note must make sense without the previous conversation.
