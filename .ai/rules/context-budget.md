# Context budget

Focused-first is a default, not a hard limit. Begin with one project, one primary repository,
its short local guide, at most three memory hits, relevant files, direct callers, direct tests,
and applicable contracts. Expand scope whenever evidence is insufficient. Never bulk-load
other projects, extended guides, the vault, raw graphs, logs, or transcripts.

- Start a fresh chat for a distinct task instead of forking or resuming unrelated history.
- Move long technical reference material out of always-loaded `CLAUDE.md`/`AGENTS.md` files;
  search and read only the named section when the task requires it.
- Ask a narrow clarification before generating a detailed plan when requirements are missing.
- Use Markdown by default; HTML Artifacts and previews require an explicit user need.
- Browser screenshots are for distinct visual states only. Prefer text/DOM extraction for facts.
- Retrieve the smallest useful external payload and do not repeat raw Jira or connector output.
- Keep model-visible shell output targeted and normally near 4 KB per command. Increase the
  budget only when specific missing evidence requires it; save full machine-readable output to
  local ignored state and return a compact summary when implementing an audit.
- Batch independent narrow reads to reduce model/tool round trips, but cap their combined output.
  One large batched response pollutes every later request just as surely as many broad reads.
