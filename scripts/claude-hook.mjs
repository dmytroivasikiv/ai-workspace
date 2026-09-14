#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateRoot = path.join(workspace, ".ai", "state", "claude");
const registryFile = path.join(workspace, "workspace.yaml");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function threshold(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Measured on this workspace: 81% of requests run above 100k context and account for 92% of
// token spend. The first advisory therefore lands while a handoff is still cheap. None of these
// stop work: they name the cheapest next move and the model keeps going.
const CONTEXT_ADVISORIES = [
  {
    at: threshold("AIW_CONTEXT_NOTE", 120000),
    text:
      "Context note: this session is past 120k. Finish what is in flight normally. When the" +
      " current sub-task ends, a fresh session seeded with a compact handoff costs far less" +
      " than continuing here, because every later tool round replays this whole context.",
  },
  {
    at: threshold("AIW_CONTEXT_CHECKPOINT", 240000),
    text:
      "Context checkpoint: past 240k, each tool round is roughly three times the cost of an" +
      " early one. Close the current coherent phase, write the project-scoped handoff to" +
      " memory/30-tasks/<project>/, and continue in a fresh session. Do not abandon work" +
      " mid-change to do this.",
  },
  {
    at: threshold("AIW_CONTEXT_DRIFT", 330000),
    text:
      "Context drift warning: this session is near compaction. Re-check current source and the" +
      " user's explicit corrections before trusting any earlier conclusion in this conversation.",
  },
];

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function loadState(file, sessionId) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { schema: 2, sessionId, promptCount: 0, warningLevel: 0, compactions: 0, activeProject: null };
  }
}

function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(registryFile, "utf8")).projects || [];
  } catch {
    return [];
  }
}

function tail(file, maxBytes = 8 * 1024 * 1024) {
  if (!file || !fs.existsSync(file)) return "";
  const descriptor = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(descriptor).size;
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    fs.readSync(descriptor, buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } finally {
    fs.closeSync(descriptor);
  }
}

function findUsage(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (value.usage && typeof value.usage === "object") output.push(value.usage);
  for (const nested of Object.values(value)) findUsage(nested, output);
  return output;
}

function observedContext(transcriptPath) {
  let latest = 0;
  for (const line of tail(transcriptPath).split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    try {
      for (const usage of findUsage(JSON.parse(line))) {
        const value = ["input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]
          .reduce((sum, key) => sum + (Number(usage[key]) || 0), 0);
        if (value > 0) latest = value;
      }
    } catch {
      // A partial first tail line or malformed record is ignored.
    }
  }
  return latest;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveFromPrompt(prompt, projects) {
  if (!prompt) return null;
  let best = null;
  for (const project of projects) {
    for (const token of [project.id, ...(project.aliases || [])]) {
      if (!token) continue;
      const match = new RegExp(`(^|[^a-z0-9_-])${escapeRegExp(token)}([^a-z0-9_-]|$)`, "i").exec(prompt);
      if (match && (best === null || match.index < best.index)) best = { project, index: match.index };
    }
  }
  return best && best.project;
}

function resolveFromCwd(cwd, projects) {
  if (!cwd) return null;
  let best = null;
  for (const project of projects) {
    const root = path.join(workspace, project.path);
    if (cwd === root || cwd.startsWith(`${root}${path.sep}`)) {
      if (!best || root.length > path.join(workspace, best.path).length) best = project;
    }
  }
  return best;
}

const GUIDE_NAMES = ["AGENTS.md", "CLAUDE.md"];
const EXTRA_GUIDES = ["THEME.md", "docs/AI_REFERENCE.md"];
const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "build", "out", "coverage",
  "__pycache__", ".venv", "venv", ".turbo", "target", ".cache", "vendor",
]);
const NESTED_VISIT_BUDGET = 64;
const NESTED_WIDE_DIR = 40;
const NESTED_DEPTH_LIMIT = 2;

function isDir(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function isFile(target) {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

function countEntries(target) {
  try {
    return fs.readdirSync(target).filter((name) => !name.startsWith(".")).length;
  } catch {
    return 0;
  }
}

function nestedGuides(root) {
  const found = [];
  let budget = NESTED_VISIT_BUDGET;

  function walk(current, level) {
    if (level > NESTED_DEPTH_LIMIT || budget <= 0) return;
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.length > NESTED_WIDE_DIR) return;
    for (const entry of entries) {
      if (budget <= 0) return;
      if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      budget -= 1;
      const child = path.join(current, entry.name);
      for (const name of GUIDE_NAMES) {
        if (isFile(path.join(child, name))) found.push(path.relative(root, path.join(child, name)));
      }
      walk(child, level + 1);
    }
  }

  walk(root, 1);
  return found;
}

function repoStandards(root) {
  if (!isDir(root)) return [];
  const found = [];
  for (const name of [...GUIDE_NAMES, ...EXTRA_GUIDES]) {
    if (isFile(path.join(root, name))) found.push(name);
  }
  const claude = path.join(root, ".claude");
  if (isDir(claude)) {
    for (const name of ["skills", "agents", "hooks"]) {
      const directory = path.join(claude, name);
      if (isDir(directory)) {
        const count = countEntries(directory);
        if (count) found.push(`.claude/${name}(${count})`);
      }
    }
    if (isFile(path.join(claude, "settings.json"))) found.push(".claude/settings.json");
  }
  found.push(...nestedGuides(root));
  return found;
}

// The vault is small and the card must never block, so relevance here is a cheap local scan
// rather than a QMD subprocess. scripts/memory-search stays the real search when depth is needed.
const MEMORY_STOPWORDS = new Set([
  "that", "this", "with", "from", "have", "want", "need", "when", "what", "where", "which",
  "please", "should", "would", "could", "make", "made", "does", "done", "into", "than", "then",
  "there", "here", "about", "after", "before", "also", "just", "like", "them", "they", "your",
  "mine", "ours", "will", "shall", "must", "code", "file", "files", "project", "repo",
]);
const MEMORY_SCAN_LIMIT = 60;
const MEMORY_HEAD_BYTES = 4096;

function promptTerms(prompt) {
  const seen = new Set();
  for (const raw of String(prompt).toLowerCase().split(/[^\p{L}\p{N}_-]+/u)) {
    const token = raw.replace(/^[-_]+|[-_]+$/g, "");
    if (token.length < 4 || MEMORY_STOPWORDS.has(token)) continue;
    seen.add(token);
    if (seen.size >= 12) break;
  }
  return [...seen];
}

function memoryNotes(projectId) {
  const base = path.join(workspace, "memory");
  const folders = [
    path.join(base, "00-profile"),
    path.join(base, "10-workspace"),
    path.join(base, "40-patterns"),
    path.join(base, "15-colleagues"),
    path.join(base, "20-projects", projectId),
    path.join(base, "30-tasks", projectId),
  ];
  const notes = [];
  for (const folder of folders) {
    let entries;
    try {
      entries = fs.readdirSync(folder);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".md") || notes.length >= MEMORY_SCAN_LIMIT) continue;
      notes.push(path.join(folder, entry));
    }
  }
  return notes;
}

function readHead(file) {
  let descriptor;
  try {
    descriptor = fs.openSync(file, "r");
  } catch {
    return "";
  }
  try {
    const buffer = Buffer.alloc(MEMORY_HEAD_BYTES);
    const read = fs.readSync(descriptor, buffer, 0, MEMORY_HEAD_BYTES, 0);
    return buffer.subarray(0, read).toString("utf8");
  } catch {
    return "";
  } finally {
    fs.closeSync(descriptor);
  }
}

function field(head, key) {
  const match = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m").exec(head);
  return match ? match[1].replace(/^['"]|['"]$/g, "") : "";
}

function noteTitle(file, head) {
  const name = field(head, "name");
  if (name) return name;
  const heading = /^#\s+(.+?)\s*$/m.exec(head);
  if (heading) return heading[1].trim();
  const base = path.basename(file, ".md");
  return base === "project" ? `${path.basename(path.dirname(file))} project` : base;
}

function memoryHits(projectId, prompt, limit = 3) {
  const terms = promptTerms(prompt);
  if (!terms.length) return [];
  const scored = [];
  for (const file of memoryNotes(projectId)) {
    const head = readHead(file);
    if (!head) continue;
    const title = noteTitle(file, head);
    const description = field(head, "description");
    const headline = `${title} ${description}`.toLowerCase();
    const body = head.toLowerCase();
    let score = 0;
    let bodyMatches = 0;
    for (const term of terms) {
      if (headline.includes(term)) score += 3;
      else if (body.includes(term)) {
        score += 1;
        bodyMatches += 1;
      }
    }
    // One headline match, or two independent body matches. A single body word is noise.
    if (score >= 3 || bodyMatches >= 2) {
      scored.push({ score, title, description, file: path.relative(workspace, file) });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

function activeRepo(project, cwd) {
  if (!cwd) return null;
  for (const repo of project.repos || []) {
    const root = path.join(workspace, repo.path);
    if (cwd === root || cwd.startsWith(`${root}${path.sep}`)) return repo;
  }
  return null;
}

function projectCard(project, cwd, prompt) {
  const contract = path.join(project.path, "AGENTS.md");
  const lines = [
    `[active project: ${project.id} — ${project.domain}]`,
    `contract: ${contract} — read it now unless it is already in context.`,
  ];
  if (project.repos && project.repos.length) {
    lines.push("repositories:");
    for (const repo of project.repos) lines.push(`  - ${repo.id} (${repo.path}) — ${repo.role}`);
    lines.push("Pick ONE primary repository and say which. Open a sibling only when an API contract,");
    lines.push("shared config, generated client, Docker seam, or shared package proves the dependency.");
  } else {
    lines.push("This project has no code repositories registered.");
  }

  if (project.team) {
    const inside = activeRepo(project, cwd);
    const rows = [];
    for (const repo of project.repos || []) {
      const found = repoStandards(path.join(workspace, repo.path));
      if (found.length) rows.push(`  - ${repo.id}: ${found.join(", ")}`);
    }
    if (rows.length) {
      lines.push("team standards owned by these repositories:");
      lines.push(...rows);
      if (inside) {
        lines.push(`cwd is inside ${inside.id}, so its .claude/ skills, agents and hooks are loaded.`);
        lines.push("Its guides are binding and win over the master contract on technical matters.");
      } else {
        lines.push("cwd is OUTSIDE every repository, so repo-local .claude/ skills, agents and hooks");
        lines.push("are NOT loaded by Claude Code. Read the listed guides as files before changing that");
        lines.push("repository, and prefer restarting the session inside it for non-trivial work.");
      }
    }
  }

  const hits = memoryHits(project.id, prompt);
  if (hits.length) {
    lines.push("memory already recorded for this prompt:");
    for (const hit of hits) {
      const summary = hit.description ? ` — ${hit.description}` : "";
      lines.push(`  - ${hit.title} (${hit.file})${summary}`.slice(0, 220));
    }
    lines.push("Read a hit before re-investigating what it already answers. These are keyword");
    lines.push("matches, not the whole vault: run scripts/memory-search when scope or symbols change.");
  } else {
    lines.push(`memory: memory/20-projects/${project.id}/, memory/30-tasks/${project.id}/, and company-wide memory/15-colleagues/`);
  }
  lines.push("Do not open another project. Hard rules stay in force: no git mutations without an");
  lines.push("explicit request, no explanatory code comments, never print a secret value, English");
  lines.push("commits and application logs, preserve unrelated local changes.");
  return lines.join("\n");
}

let input;
try {
  input = JSON.parse(readStdin() || "{}");
} catch {
  process.exit(0);
}
const sessionId = input.session_id;
if (!uuid.test(sessionId || "")) process.exit(0);
fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
const stateFile = path.join(stateRoot, `${sessionId}.json`);
const state = loadState(stateFile, sessionId);
const event = input.hook_event_name;
const now = new Date().toISOString();

if (event === "SessionStart") {
  state.startedAt ??= now;
  state.lastStartedAt = now;
  state.startSource = input.source || "unknown";
  state.cwd = input.cwd || state.cwd;
  if (["clear", "compact"].includes(input.source)) {
    state.warningLevel = 0;
    state.activeProject = null;
  }
  atomicJson(stateFile, state);
} else if (event === "UserPromptSubmit") {
  state.promptCount = (state.promptCount || 0) + 1;
  state.lastPromptAt = now;
  state.lastObservedContext = observedContext(input.transcript_path);

  const projects = loadRegistry();
  const resolved =
    resolveFromPrompt(input.prompt || "", projects) ||
    resolveFromCwd(input.cwd || "", projects) ||
    null;

  const blocks = [];
  if (resolved && resolved.id !== state.activeProject) {
    state.activeProject = resolved.id;
    blocks.push(projectCard(resolved, input.cwd || "", input.prompt || ""));
  } else if (!resolved && state.activeProject === null && state.promptCount === 1) {
    blocks.push(
      "[no project resolved] Name the project in the first sentence, or work from inside its" +
        " directory. Registered ids and aliases are in workspace.yaml. Do not guess a project" +
        " and do not search several projects."
    );
  }

  for (let level = CONTEXT_ADVISORIES.length; level > state.warningLevel; level -= 1) {
    const advisory = CONTEXT_ADVISORIES[level - 1];
    if (state.lastObservedContext < advisory.at) continue;
    state.warningLevel = level;
    blocks.push(advisory.text);
    break;
  }

  atomicJson(stateFile, state);
  if (blocks.length) process.stdout.write(blocks.join("\n\n"));
} else if (event === "PreCompact") {
  state.preCompactAt = now;
  state.preCompactTrigger = input.trigger || "unknown";
  atomicJson(stateFile, state);
} else if (event === "PostCompact") {
  state.postCompactAt = now;
  state.postCompactTrigger = input.trigger || "unknown";
  state.warningLevel = 0;
  state.activeProject = null;
  state.compactions = (state.compactions || 0) + 1;
  const summary = Buffer.from(String(input.compact_summary || ""), "utf8").subarray(0, 64 * 1024).toString("utf8");
  atomicJson(path.join(stateRoot, `${sessionId}-compact-${state.compactions}.json`), {
    schema: 2,
    sessionId,
    trigger: input.trigger || "unknown",
    createdAt: now,
    summary,
  });
  atomicJson(stateFile, state);
} else if (event === "SessionEnd") {
  state.endedAt = now;
  state.endReason = input.reason || "unknown";
  state.lastObservedContext = observedContext(input.transcript_path) || state.lastObservedContext || 0;
  atomicJson(stateFile, state);
}
