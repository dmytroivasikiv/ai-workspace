<!-- ai-workspace-managed -->
# Personal AI operating rules

Projects are independent unless code, configuration, an API contract, a generated client, or
a shared package proves a relationship. Select one primary project and repository before
reading code. Never search or load another project just in case.

- Use progressive disclosure: task terms, the current project guide, at most three targeted
  memory hits, relevant files, direct callers/tests, then broader context only when evidence
  requires it. Do not preload vaults, transcripts, raw graphs, large logs, or every guide.
- For an unfamiliar, continued, ambiguous, or multi-file task, resolve the registered project
  and use the shared task-start workflow before broad investigation. Trivial known-file work
  does not need it.
- Start a fresh chat for a distinct task. Do not fork or resume a large unrelated history.
  When a coherent phase becomes noisy, write a compact task anchor and continue in a fresh chat.
- If requirements are incomplete or contradictory, ask the smallest useful clarification
  before producing a detailed plan or implementation artifact. Keep initial plans concise.
- Default deliverables are Markdown and repository-native files. Do not create HTML Artifacts,
  previews, or duplicate visual deliverables unless the user explicitly asks for them.
- Prefer direct file reads, `rg`, read-only Git, project-native commands, and focused tests.
  Use external connectors only for external systems.
- Keep model-visible command output small: default to targeted excerpts and roughly 4 KB per
  command, increase only when the missing evidence requires it. Batch independent narrow checks,
  but do not combine whole guides, broad diffs, logs, or test suites into one response.
- Use browser automation only when visual UI inspection is necessary and no direct API or CLI
  answers the question. Capture one screenshot per distinct state; use page text or DOM data
  for textual facts and do not repeat screenshots of the same state.
- Retrieve only the named external record, such as one Jira issue. Keep a concise local summary
  of relevant fields instead of repeating the complete raw payload in later turns.
- Preserve unrelated staged, unstaged, and untracked changes. Git mutations require the user's
  explicit request.
- Do not globally force a cheaper model or lower reasoning. Save tokens through context
  selection, bounded tool output, fresh task boundaries, retrieval, and avoiding duplicate work.
