# Add your workspace

1. Run `./bin/aiw setup` after cloning.
2. Keep `workspace.yaml.example` as a safe template. Your ignored `workspace.yaml` contains local repository paths.
3. Register a repository with `./bin/aiw add-project <project-id> <repo-id> <path> --role <role> --domain <domain> --team`.
4. Replace the generated project note with verified facts and make sure the repository has a short `AGENTS.md`.
5. Run `./bin/aiw setup --user-adapters` once per machine to enable shared Claude hooks and Claude/Codex rules from any working directory.
6. Run `./bin/aiw doctor`. Optional machine adapters appear as warnings until you install them; `./bin/aiw doctor --strict` treats every warning as a failure.

Keep unrelated products in different project entries. Put multiple repositories in one project only when code, configuration, an API contract, a generated client, or a shared package proves the relationship.
