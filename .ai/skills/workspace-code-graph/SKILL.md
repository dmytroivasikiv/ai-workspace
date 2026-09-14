---
name: workspace-code-graph
description: Use an isolated on-demand Graphify index for architecture, call paths, dependency tracing, blast radius, large unfamiliar codebases, or broad reviews when direct source search cannot answer a structural question.
---

# Use a project code graph

Do not use Graphify for an exact symbol, one known file, or a task already bounded to a few files. Run `"$HOME/.local/bin/aiw-code-graph" status <repo-id>` first, then the narrowest `query`, `explain`, `path`, `affected`, `hubs`, `tree`, or `callflow` command through the same launcher. It is independent of the current project directory; do not substitute a cwd-relative helper path. Refresh a stale graph only when current graph evidence is needed.

Never merge repositories globally, enable watch mode, or load raw graph JSON into model context. Treat inferred edges, dependency injection, runtime configuration, and framework magic as navigation hints; verify candidate edges in source before edits or conclusions.
