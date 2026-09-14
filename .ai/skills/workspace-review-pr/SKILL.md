---
name: workspace-review-pr
description: Review a PR, branch, commit range, staged diff, working tree, pasted review comments, or repeat review while reconciling prior finding status and avoiding resolved or dismissed duplicates.
---

# Review with continuity

1. Resolve project, repo, base/head, and review key.
2. Load the local ledger; if GitHub is available, reconcile bounded current threads too.
3. Inspect the diff before broad context, trace changed behavior, and validate a concrete failure scenario.
4. Fingerprint semantic findings and classify them as new, still-open, accepted, dismissed, resolved, or reintroduced.
5. Report only actionable current findings; never present resolved/dismissed history as new.
6. Store semantic scenarios and dispositions, never full diffs, PR bodies, secrets, or chats.

Use `"$HOME/.local/bin/aiw-pr-review-context"`; this installed launcher is independent of the current project directory. GitHub failure must fall back to the local ledger without blocking review.
