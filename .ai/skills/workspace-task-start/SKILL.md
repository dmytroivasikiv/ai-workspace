---
name: workspace-task-start
description: Resolve and scope an unfamiliar, ambiguous, multi-file, debugging, architecture, or continued task in this personal multi-project workspace. Use when prior project memory may save investigation or when a named task must continue; skip for trivial known-file edits.
---

# Start a workspace task

1. Resolve the logical project and one primary repository from `workspace.yaml`.
2. Run a bounded `"$HOME/.local/bin/aiw-task-context" <project-id> <short terms>` using only task ID, domain, symbols, and concise terms. This installed launcher is independent of the current project directory.
3. If the primary repo guide is not already present in the current context, read it once. Do not
   re-read it in later turns; open only a relevant section of its extended reference when direct
   evidence requires more detail. Read no more than three promising memory hits.
4. Inspect exact files, direct callers, tests, and relevant contracts/configuration.
5. Expand inside the project only when evidence requires it; read another project only after a confirmed dependency and user-visible justification.

The context packet is guidance, not a permission receipt or context ceiling.
