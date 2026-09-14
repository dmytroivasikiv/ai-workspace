---
name: qmd
description: Search scoped local Markdown memory for earlier decisions, explicit corrections, recurring failures, project conventions, debugging findings, or named task continuation; retrieve sources after ranking and keep project boundaries intact.
---

# Search scoped memory

Run `"$HOME/.local/bin/aiw-memory-search" <project-id> "<specific terms>"`. This installed launcher is independent of the current project directory; do not substitute a cwd-relative helper path. Default to lexical BM25 for exact phrases, task IDs, symbols, commands, and filenames. Use `--semantic` only when wording differs or lexical search fails; the circuit breaker safely falls back to lexical search after a model/backend failure.

Search first, then retrieve and read only promising source notes. Do not answer precise decision/history questions from snippets alone. Repeat with new targeted terms when scope or symbols change. Never start QMD MCP, run embeddings automatically, search another project's collection, or paste the whole result set into context.
