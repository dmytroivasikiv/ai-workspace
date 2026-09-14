#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(fs.readFileSync(path.join(workspace, "workspace.yaml"), "utf8"));
const sessionsRoot = path.join(os.homedir(), ".codex", "sessions");
const requested = process.argv[2] || "";
const selectedProject = requested
  ? registry.projects.find((project) => project.id === requested || (project.aliases || []).includes(requested))
  : null;
if (requested && !selectedProject) {
  console.error(`Unknown project id: ${requested}`);
  process.exit(64);
}

function absolute(relative) {
  return path.resolve(workspace, relative || "");
}

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

function recent(file, days = 3) {
  return Date.now() - fs.statSync(file).mtimeMs <= days * 24 * 60 * 60 * 1000;
}

function projectRows(file, project) {
  const rows = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // Ignore partial or malformed records.
    }
  }
  if (!project) return rows;

  const preamble = rows.filter((row) => row.type === "session_meta");
  const groups = [];
  let current = [];
  for (const row of rows) {
    if (row.type === "event_msg" && row.payload?.type === "task_started") {
      if (current.length) groups.push(current);
      current = [row];
    } else if (current.length) {
      current.push(row);
    }
  }
  if (current.length) groups.push(current);

  const projectPaths = projectRoots(project);
  const projectNames = [project.id, ...(project.aliases || []), path.basename(project.path || "")]
    .map((name) => name.toLowerCase());
  const relevant = groups.filter((group) => group.some((row) => {
    const payload = row.payload || {};
    if ([payload.cwd, payload.workdir].some((cwd) => projectPaths.some((root) => cwd?.startsWith(root)))) return true;
    if (row.type === "response_item" && payload.type === "custom_tool_call") {
      const input = String(payload.input || "");
      return projectPaths.some((root) => input.includes(root))
        || projectNames.some((name) => input.toLowerCase().includes(name));
    }
    if (row.type === "response_item" && payload.type === "message" && payload.role === "user") {
      const content = JSON.stringify(payload.content || "").toLowerCase();
      return projectNames.some((name) => content.includes(name));
    }
    return false;
  }));
  return relevant.length ? [...preamble, ...relevant.flat()] : [];
}

function textBytes(value) {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value || ""));
}

const sessionRows = walk(sessionsRoot)
  .filter((file) => file.endsWith(".jsonl") && recent(file))
  .map((file) => ({ file, rows: projectRows(file, selectedProject) }))
  .filter((session) => session.rows.length > 0);
const apiSteps = new Map();
const turns = new Set();
const toolCalls = new Map();
const toolOutputs = new Map();
const compactions = new Set();
const models = {};
let rawApiSteps = 0;
let maxContext = 0;
let maxBaseInstructionBytes = 0;
let maxDynamicToolBytes = 0;

for (const { file, rows } of sessionRows) {
  for (const row of rows) {
    const payload = row.payload || {};
    if (row.type === "session_meta") {
      maxBaseInstructionBytes = Math.max(maxBaseInstructionBytes, textBytes(payload.base_instructions?.text));
      maxDynamicToolBytes = Math.max(maxDynamicToolBytes, textBytes(payload.dynamic_tools));
    } else if (row.type === "turn_context") {
      const model = payload.model || "unknown";
      models[model] = (models[model] || 0) + 1;
    } else if (row.type === "event_msg" && payload.type === "task_started") {
      turns.add(payload.turn_id || `${file}:${row.ordinal}`);
    } else if (row.type === "event_msg" && payload.type === "token_count") {
      rawApiSteps += 1;
      const usage = payload.info?.last_token_usage || {};
      const key = `${row.timestamp}\0${JSON.stringify(usage)}`;
      apiSteps.set(key, usage);
      maxContext = Math.max(maxContext, Number(usage.input_tokens) || 0);
    } else if (row.type === "response_item" && payload.type === "custom_tool_call") {
      const id = payload.call_id || payload.id || `${file}:${row.ordinal}`;
      toolCalls.set(id, { name: payload.name || "unknown", input: String(payload.input || "") });
    } else if (row.type === "response_item" && payload.type === "custom_tool_call_output") {
      const id = payload.call_id || payload.id || `${file}:${row.ordinal}`;
      toolOutputs.set(id, Math.max(toolOutputs.get(id) || 0, textBytes(payload.output)));
    } else if (row.type === "compacted") {
      compactions.add(payload.window_id || payload.first_window_id || `${file}:${row.ordinal}`);
    }
  }
}

const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };
for (const row of apiSteps.values()) {
  usage.inputTokens += Number(row.input_tokens) || 0;
  usage.cachedInputTokens += Number(row.cached_input_tokens) || 0;
  usage.outputTokens += Number(row.output_tokens) || 0;
  usage.reasoningOutputTokens += Number(row.reasoning_output_tokens) || 0;
}
const outputByTool = {};
const largestToolOutputs = [];
for (const [id, bytes] of toolOutputs) {
  const call = toolCalls.get(id) || { name: "unknown", input: "" };
  outputByTool[call.name] ||= { calls: 0, bytes: 0 };
  outputByTool[call.name].calls += 1;
  outputByTool[call.name].bytes += bytes;
  largestToolOutputs.push({ bytes, tool: call.name, inputPreview: call.input.slice(0, 180) });
}

console.log(JSON.stringify({
  project: selectedProject?.id || "all-recent",
  windowDays: 3,
  sessionFiles: sessionRows.length,
  uniqueTurns: turns.size,
  uniqueApiSteps: apiSteps.size,
  duplicateForkApiSteps: rawApiSteps - apiSteps.size,
  compactions: compactions.size,
  ...usage,
  maxObservedInput: maxContext,
  models,
  fixedContextBytes: { baseInstructions: maxBaseInstructionBytes, dynamicTools: maxDynamicToolBytes },
  toolOutputBytes: Object.fromEntries(Object.entries(outputByTool).sort((a, b) => b[1].bytes - a[1].bytes)),
  largestToolOutputs: largestToolOutputs.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
  caveat: "Token events are deduplicated across fork files by timestamp and last-usage payload. Project selection from root-started sessions is inferred from path/id references and can include a mixed-project history. Provider quota conversion is not inferred.",
}, null, 2));
