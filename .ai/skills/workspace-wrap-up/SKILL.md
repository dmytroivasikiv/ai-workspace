---
name: workspace-wrap-up
description: Finish substantial implementation, debugging, investigation, or review work with diff inspection, proportional verification, compact reporting, and at most one durable lesson. Use for handoff or completion; skip for trivial one-line work.
---

# Wrap up workspace work

1. Run `"$HOME/.local/bin/aiw-task-finish" <repo-id>` and inspect the actual final diff. This installed launcher is independent of the current project directory.
2. Preserve unrelated staged, unstaged, and untracked changes.
3. Run verification proportional to risk.
4. Report outcome, changed files, passed checks, checks not run, and remaining risk.
5. Promote at most one genuinely reusable verified lesson. For repeated agent failure, prefer a test, narrow rule, or skill improvement.

Do not turn temporary task state, logs, diffs, or guesses into durable memory.
