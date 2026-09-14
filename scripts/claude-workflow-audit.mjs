#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const transcriptRoot = path.join(os.homedir(), ".claude", "projects");
const registry = JSON.parse(fs.readFileSync(path.join(workspace, "workspace.yaml"), "utf8"));
const requested = process.argv[2];
const selected = requested
  ? registry.projects.filter(
      (project) => project.id === requested || (project.aliases || []).includes(requested),
    )
  : registry.projects;

if (requested && selected.length === 0) {
  console.error(`Unknown project id: ${requested}`);
  process.exit(64);
}

function absolute(relative) {
  return path.resolve(workspace, relative || "");
}

const RETRIEVAL_SIGNALS = [
  ["task-context", /task-context/],
  ["memory-search", /memory-search|\bqmd\b/],
  ["code-graph", /code-graph/],
  ["task-finish", /task-finish/],
];

function projectRoots(project) {
  return [absolute(project.path), ...(project.repos || []).map((repo) => absolute(repo.path))];
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function textContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text").map((block) => block.text || "").join("");
}

function maxUsage(target, usage) {
  const fields = {
    input: "input_tokens",
    cacheRead: "cache_read_input_tokens",
    cacheCreation: "cache_creation_input_tokens",
    output: "output_tokens",
  };
  for (const [destination, source] of Object.entries(fields)) {
    target[destination] = Math.max(target[destination] || 0, Number(usage?.[source]) || 0);
  }
  target.thinking = Math.max(
    target.thinking || 0,
    Number(usage?.output_tokens_details?.thinking_tokens) || 0,
  );
  target.context = Math.max(
    target.context || 0,
    (Number(usage?.input_tokens) || 0)
      + (Number(usage?.cache_read_input_tokens) || 0)
      + (Number(usage?.cache_creation_input_tokens) || 0),
  );
}

function projectRows(file, project) {
  const rows = fs.readFileSync(file, "utf8").split("\n").flatMap((line) => {
    if (!line.startsWith("{")) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const groups = [];
  let current = [];
  for (const row of rows) {
    const message = row.message || {};
    const content = message.content;
    const hasToolResults = Array.isArray(content) && content.some((block) => block?.type === "tool_result");
    const startsPrompt = row.type === "user" && !hasToolResults && !message.isMeta
      && (row.origin != null || row.promptSource != null);
    if (startsPrompt && current.length) groups.push(current);
    if (startsPrompt) current = [row];
    else if (current.length) current.push(row);
  }
  if (current.length) groups.push(current);

  const paths = projectRoots(project);
  const names = [project.id, ...(project.aliases || []), path.basename(project.path || "")]
    .map((name) => name.toLowerCase());
  return groups.filter((group) => group.some((row) => {
    if (paths.some((root) => row.cwd?.startsWith(root))) return true;
    const message = row.message || {};
    if (row.type === "user" && !message.isMeta) {
      const value = textContent(message.content).toLowerCase();
      if (names.some((name) => value.includes(name))) return true;
    }
    if (row.type === "assistant") {
      return (message.content || []).some((block) => {
        if (block?.type !== "tool_use") return false;
        const input = JSON.stringify(block.input || {});
        return paths.some((root) => input.includes(root))
          || names.some((name) => input.toLowerCase().includes(name));
      });
    }
    return false;
  })).flat();
}

function transcriptFiles(project) {
  const tokens = projectRoots(project).map((value) => value.replaceAll("/", "-"));
  const rootDirectories = [workspace, path.dirname(workspace)]
    .filter(Boolean)
    .map((value) => value.replaceAll("/", "-"));
  return walk(transcriptRoot).filter((file) => {
    if (!file.endsWith(".jsonl")) return false;
    const directory = path.basename(path.dirname(file));
    const candidate = tokens.some((token) => directory.startsWith(token))
      || rootDirectories.some((root) => directory.startsWith(root));
    return candidate && projectRows(file, project).length > 0;
  });
}

function audit(project) {
  const files = transcriptFiles(project);
  const directDirectoryTokens = projectRoots(project).map((value) => value.replaceAll("/", "-"));
  const rootInferredTranscripts = files.filter((file) => {
    const directory = path.basename(path.dirname(file));
    return !directDirectoryTokens.some((token) => directory.startsWith(token));
  }).length;
  const messages = new Map();
  const toolUses = new Map();
  const toolResults = new Map();
  const prompts = new Map();
  const compactions = new Set();
  const sessions = new Map();
  const rounds = new Map();
  const retrieval = new Map();

  for (const file of files) {
    const sessionId = path.basename(file, ".jsonl");
    const session = { apiIds: new Set(), promptIds: new Set(), bytes: fs.statSync(file).size };
    sessions.set(sessionId, session);
    for (const row of projectRows(file, project)) {
      const message = row.message || {};
      const timestamp = row.timestamp || "";
      if (row.subtype === "compact_boundary" || row.compactMetadata) {
        compactions.add(row.uuid || row.parentUuid || hash(JSON.stringify(row)));
      }
      if (row.type === "assistant") {
        const messageId = message.id;
        if (messageId) {
          if (!messages.has(messageId)) {
            messages.set(messageId, {
              timestamp,
              model: message.model || "unknown",
              effort: row.effort || "unknown",
              sessions: new Set(),
            });
          }
          const record = messages.get(messageId);
          record.sessions.add(sessionId);
          maxUsage(record, message.usage || {});
          session.apiIds.add(messageId);
        }
        const round = (message.content || []).filter((block) => block?.type === "tool_use");
        if (round.length) {
          const roundId = messageId || hash(JSON.stringify(round));
          if (!rounds.has(roundId)) rounds.set(roundId, round.length);
        }
        for (const block of round) {
          const id = block.id || hash(JSON.stringify(block));
          if (!toolUses.has(id)) {
            toolUses.set(id, {
              name: block.name || "unknown",
              inputBytes: Buffer.byteLength(JSON.stringify(block.input || {})),
            });
          }
          if (retrieval.has(id)) continue;
          if (block.name === "Skill") {
            retrieval.set(id, `skill:${block.input?.skill || "unknown"}`);
            continue;
          }
          if (block.name !== "Bash") continue;
          const command = String(block.input?.command || "");
          for (const [label, pattern] of RETRIEVAL_SIGNALS) {
            if (pattern.test(command)) {
              retrieval.set(id, label);
              break;
            }
          }
        }
      } else if (row.type === "user") {
        const content = message.content;
        const results = Array.isArray(content)
          ? content.filter((block) => block?.type === "tool_result")
          : [];
        if (results.length) {
          for (const block of results) {
            const id = block.tool_use_id || hash(JSON.stringify(block));
            const value = typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content || "");
            const bytes = Buffer.byteLength(value);
            toolResults.set(id, Math.max(toolResults.get(id) || 0, bytes));
          }
        } else if (!message.isMeta && (row.origin != null || row.promptSource != null)) {
          const value = textContent(content);
          const id = hash(`${timestamp}\0${value}`);
          if (!prompts.has(id)) {
            prompts.set(id, { timestamp, bytes: Buffer.byteLength(value), sessions: new Set() });
          }
          prompts.get(id).sessions.add(sessionId);
          session.promptIds.add(id);
        }
      }
    }
  }

  const totals = {
    apiRequests: messages.size,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    maxObservedContext: 0,
    requestsOver100k: 0,
    requestsOver200k: 0,
  };
  const models = {};
  const efforts = {};
  for (const message of messages.values()) {
    totals.cacheReadTokens += message.cacheRead || 0;
    totals.cacheCreationTokens += message.cacheCreation || 0;
    totals.outputTokens += message.output || 0;
    totals.thinkingTokens += message.thinking || 0;
    totals.maxObservedContext = Math.max(totals.maxObservedContext, message.context || 0);
    totals.requestsOver100k += Number((message.context || 0) > 100_000);
    totals.requestsOver200k += Number((message.context || 0) > 200_000);
    models[message.model] = (models[message.model] || 0) + 1;
    efforts[message.effort] = (efforts[message.effort] || 0) + 1;
  }

  const toolOutput = {};
  for (const [id, bytes] of toolResults) {
    const name = toolUses.get(id)?.name || "unknown";
    toolOutput[name] ||= { calls: 0, bytes: 0 };
    toolOutput[name].calls += 1;
    toolOutput[name].bytes += bytes;
  }
  const sortedToolOutput = Object.fromEntries(
    Object.entries(toolOutput).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 15),
  );
  const sessionSets = [...sessions.values()].map((session) => session.apiIds);
  const common = sessionSets.length
    ? sessionSets.reduce((left, right) => new Set([...left].filter((id) => right.has(id))))
    : new Set();
  const guideBytes = Object.fromEntries(project.repos.map((repo) => {
    const guide = path.join(absolute(repo.path), repo.guide);
    return [repo.id, fs.existsSync(guide) ? fs.statSync(guide).size : null];
  }));

  return {
    project: project.id,
    transcripts: files.length,
    rootInferredTranscripts,
    uniqueHumanPrompts: prompts.size,
    compactions: compactions.size,
    forkOverlap: {
      sharedApiRequests: common.size,
      branchOnlyApiRequests: messages.size - common.size,
      duplicateRequestReferences: [...sessions.values()].reduce((sum, row) => sum + row.apiIds.size, 0) - messages.size,
    },
    ...totals,
    models,
    efforts,
    largeHumanPrompts: [...prompts.values()].filter((prompt) => prompt.bytes >= 10_000).length,
    toolCalls: Object.fromEntries(
      [...toolUses.values()].reduce((map, tool) => map.set(tool.name, (map.get(tool.name) || 0) + 1), new Map()),
    ),
    toolRounds: rounds.size,
    batchedRounds: [...rounds.values()].filter((size) => size > 1).length,
    toolCallsPerPrompt: prompts.size ? Number(([...rounds.values()].reduce((a, b) => a + b, 0) / prompts.size).toFixed(1)) : 0,
    retrievalCalls: [...retrieval.values()].reduce((map, label) => map.set(label, (map.get(label) || 0) + 1), new Map()).size
      ? Object.fromEntries([...retrieval.values()].reduce((map, label) => map.set(label, (map.get(label) || 0) + 1), new Map()))
      : {},
    toolOutputBytes: sortedToolOutput,
    alwaysLoadedGuideBytes: guideBytes,
    caveat: "Usage is deduplicated by assistant message.id. Root-started transcripts are inferred from project path/id references and may span more than one project. Plan-quota conversion is provider-specific and is not inferred here.",
  };
}

const results = selected.map(audit);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const million = (value) => `${(value / 1e6).toFixed(1)}M`;
  const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : "-");
  console.log("project              tx  prompts  reqs  rounds  tools/pr  batched  cacheRead  out    maxCtx  >100k  rootStart");
  for (const row of results) {
    if (!row.apiRequests) continue;
    console.log(
      [
        row.project.padEnd(18),
        String(row.transcripts).padStart(4),
        String(row.uniqueHumanPrompts).padStart(8),
        String(row.apiRequests).padStart(5),
        String(row.toolRounds).padStart(7),
        String(row.toolCallsPerPrompt).padStart(9),
        percent(row.batchedRounds, row.toolRounds).padStart(8),
        million(row.cacheReadTokens).padStart(10),
        million(row.outputTokens).padStart(6),
        `${Math.round(row.maxObservedContext / 1000)}k`.padStart(7),
        percent(row.requestsOver100k, row.apiRequests).padStart(6),
        percent(row.rootInferredTranscripts, row.transcripts).padStart(10),
      ].join(" "),
    );
  }
  console.log("\nretrieval layer used (calls):");
  for (const row of results) {
    if (!row.apiRequests) continue;
    const used = Object.entries(row.retrievalCalls);
    console.log(`  ${row.project.padEnd(18)} ${used.length ? used.map(([k, v]) => `${k}:${v}`).join("  ") : "none"}`);
  }
  console.log("\nPass --json for the full record. Usage is deduplicated by assistant message id;");
  console.log("root-started transcripts are inferred and may span more than one project.");
}
