#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(fs.readFileSync(path.join(workspace, "workspace.yaml"), "utf8"));
const statuses = new Set(["reported", "still-open", "accepted", "dismissed", "resolved", "reintroduced"]);

function usage(message = "") {
  if (message) console.error(`ERROR ${message}`);
  console.error("Usage: pr-review-context.mjs collect <project> <review-key> [--repo REPO --pr N] | record <project> <review-key> <path> <symbol> <scenario> [status] | set <project> <review-key> <fingerprint> <status>");
  process.exit(64);
}

function clean(value) {
  return String(value).trim().toLowerCase().replaceAll("\\", "/").replace(/\s+/g, " ");
}

function fingerprint(project, reviewKey, filePath, symbol, scenario) {
  return crypto.createHash("sha256").update([project, reviewKey, clean(filePath), clean(symbol), clean(scenario)].join("\n")).digest("hex").slice(0, 12);
}

function locations(project, reviewKey) {
  return {
    state: path.join(workspace, ".ai", "state", "reviews", `${project}--${reviewKey}.json`),
    mirror: path.join(workspace, "memory", "30-tasks", project, `review-${project}-${reviewKey}.md`),
  };
}

function load(project, reviewKey) {
  const files = locations(project, reviewKey);
  try {
    return JSON.parse(fs.readFileSync(files.state, "utf8"));
  } catch {
    return { schema: 1, project, reviewKey, findings: [], githubGapReported: false };
  }
}

function save(ledger) {
  const files = locations(ledger.project, ledger.reviewKey);
  fs.mkdirSync(path.dirname(files.state), { recursive: true });
  const temporary = `${files.state}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, files.state);
  fs.mkdirSync(path.dirname(files.mirror), { recursive: true });
  const rows = ledger.findings.map((finding) => `- \`${finding.id}\` **${finding.status}** — ${finding.path} / ${finding.symbol}: ${finding.scenario}`);
  fs.writeFileSync(files.mirror, `# Review ${ledger.reviewKey}\n\n- Project: ${ledger.project}\n- Updated: ${ledger.updatedAt}\n\n## Semantic findings\n\n${rows.join("\n") || "No findings recorded."}\n`);
}

function gh(args, timeout, cwd = workspace) {
  return spawnSync("gh", args, { cwd, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
}

function githubContext(prNumber, cwd) {
  const auth = gh(["auth", "status"], 3000, cwd);
  if (auth.status !== 0) return { available: false, note: "GitHub authentication unavailable; local ledger continuity is active." };
  const repository = gh(["repo", "view", "--json", "nameWithOwner"], 5000, cwd);
  if (repository.status !== 0) return { available: false, note: "GitHub repository resolution failed; local ledger continuity is active." };
  let nameWithOwner;
  try {
    nameWithOwner = JSON.parse(repository.stdout).nameWithOwner;
  } catch {
    return { available: false, note: "GitHub repository response was invalid; local ledger continuity is active." };
  }
  const [owner, name] = String(nameWithOwner).split("/");
  const query = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number url comments(last:20){nodes{author{login}body createdAt}}reviews(last:20){nodes{author{login}body state submittedAt}}reviewThreads(first:50){nodes{isResolved path line originalLine comments(first:20){nodes{author{login}body createdAt path line originalLine isOutdated}}}}}}}`;
  const result = gh(["api", "graphql", "-f", `query=${query}`, "-f", `owner=${owner}`, "-f", `name=${name}`, "-F", `number=${Number(prNumber)}`], 10000, cwd);
  if (result.status !== 0) return { available: false, note: "GitHub GraphQL review-thread lookup failed; local ledger continuity is active." };
  try {
    const pr = JSON.parse(result.stdout)?.data?.repository?.pullRequest;
    if (!pr) return { available: false, note: "GitHub PR was not found; local ledger continuity is active." };
    return {
      available: true,
      number: pr.number,
      url: pr.url,
      comments: pr.comments?.nodes || [],
      reviews: pr.reviews?.nodes || [],
      threads: pr.reviewThreads?.nodes || [],
    };
  } catch {
    return { available: false, note: "GitHub GraphQL response was invalid; local ledger continuity is active." };
  }
}

const [command, requestedProjectId, reviewKey, ...args] = process.argv.slice(2);
if (!command || !requestedProjectId || !reviewKey) usage();
const selectedProject = registry.projects.find(
  (item) => item.id === requestedProjectId || (item.aliases || []).includes(requestedProjectId),
);
if (!selectedProject) usage(`unknown project: ${requestedProjectId}`);
const projectId = selectedProject.id;
const ledger = load(projectId, reviewKey);

if (command === "record") {
  if (args.length < 3) usage();
  const [filePath, symbol, scenario, requestedStatus = "reported"] = args;
  if (!statuses.has(requestedStatus)) usage(`invalid status: ${requestedStatus}`);
  const id = fingerprint(projectId, reviewKey, filePath, symbol, scenario);
  const existing = ledger.findings.find((item) => item.id === id);
  const finding = { id, path: clean(filePath), symbol: clean(symbol), scenario: String(scenario).trim(), status: requestedStatus, updatedAt: new Date().toISOString() };
  if (existing) Object.assign(existing, finding);
  else ledger.findings.push(finding);
  ledger.updatedAt = finding.updatedAt;
  save(ledger);
  console.log(JSON.stringify(finding));
} else if (command === "set") {
  const [id, status] = args;
  if (!id || !statuses.has(status)) usage();
  const finding = ledger.findings.find((item) => item.id === id);
  if (!finding) usage(`unknown finding: ${id}`);
  finding.status = status;
  finding.updatedAt = new Date().toISOString();
  ledger.updatedAt = finding.updatedAt;
  save(ledger);
  console.log(JSON.stringify(finding));
} else if (command === "collect") {
  let github = { available: false, note: "GitHub review threads unavailable; local ledger continuity is active." };
  const prIndex = args.indexOf("--pr");
  if (prIndex >= 0 && args[prIndex + 1]) {
    const project = registry.projects.find((item) => item.id === projectId);
    const repoIndex = args.indexOf("--repo");
    const repoId = repoIndex >= 0 ? args[repoIndex + 1] : project?.repos?.[0]?.id;
    const repo = project?.repos?.find((item) => item.id === repoId);
    if (!repo) github = { available: false, note: "Requested repository is not registered in this project; local ledger continuity is active." };
    else github = githubContext(args[prIndex + 1], repo.path);
  }
  const packet = JSON.stringify({ project: projectId, reviewKey, github, findings: ledger.findings }, null, 2);
  process.stdout.write(packet.slice(0, 20000));
} else {
  usage();
}
