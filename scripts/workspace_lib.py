#!/usr/bin/env python3
"""Shared dependency-free helpers for the personal AI workspace."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


WORKSPACE = Path(__file__).resolve().parents[1]
REGISTRY = WORKSPACE / "workspace.yaml"


def fail(message: str, code: int = 1) -> "NoReturn":
    print(f"ERROR {message}", file=sys.stderr)
    raise SystemExit(code)


def load_registry() -> dict[str, Any]:
    try:
        value = json.loads(REGISTRY.read_text())
    except (OSError, json.JSONDecodeError) as error:
        fail(f"invalid registry {REGISTRY}: {error}")
    if value.get("schema") != 3 or not isinstance(value.get("projects"), list):
        fail("workspace.yaml must use schema 3 and contain a projects list")
    return value


def resolve(relative: str) -> Path:
    return (WORKSPACE / relative).resolve()


def projects() -> list[dict[str, Any]]:
    return load_registry()["projects"]


def project(project_id: str) -> dict[str, Any]:
    for row in projects():
        if row.get("id") == project_id or project_id in row.get("aliases", []):
            return row
    fail(f"unknown project id: {project_id}", 64)


def repo(repo_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    for project_row in projects():
        for repo_row in project_row.get("repos", []):
            if repo_row.get("id") == repo_id:
                return project_row, repo_row
    fail(f"unknown repository id: {repo_id}", 64)


def run(*args: str, cwd: Path | None = None, timeout: int = 15) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            list(args), cwd=cwd, check=False, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return subprocess.CompletedProcess(list(args), 124, "", str(error))


def git(path: Path, *args: str, timeout: int = 15) -> subprocess.CompletedProcess[str]:
    return run("git", "-C", str(path), *args, timeout=timeout)


def git_state(path: Path) -> tuple[str, str]:
    branch = git(path, "branch", "--show-current").stdout.strip() or "detached"
    status = git(path, "status", "--porcelain=v1", "--untracked-files=normal").stdout
    return branch, "dirty" if status else "clean"


def qmd_env() -> dict[str, str]:
    state = WORKSPACE / ".qmd"
    (state / "config").mkdir(parents=True, exist_ok=True)
    (state / "cache").mkdir(parents=True, exist_ok=True)
    environment = {
        **os.environ,
        "XDG_CONFIG_HOME": str(state / "config"),
        "XDG_CACHE_HOME": str(state / "cache"),
    }
    brew = run("brew", "--prefix").stdout.strip()
    if brew:
        environment["BREW_PREFIX"] = brew
    return environment


def qmd(*args: str, timeout: int = 30) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["qmd", "--index", "ai-workspace", *args], cwd=WORKSPACE,
            env=qmd_env(), check=False, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return subprocess.CompletedProcess(["qmd", *args], 124, "", str(error))


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


GUIDE_NAMES = ("AGENTS.md", "CLAUDE.md")
SKIP_DIRS = {
    ".git", "node_modules", ".next", "dist", "build", "out", "coverage",
    "__pycache__", ".venv", "venv", ".turbo", "target", ".cache", "vendor",
}
NESTED_VISIT_BUDGET = 64
NESTED_WIDE_DIR = 40
NESTED_DEPTH_LIMIT = 2


def nested_guides(root: Path, depth: int = NESTED_DEPTH_LIMIT) -> list[str]:
    """Guides below the repository root, found under a bounded traversal budget.

    Two levels are enough for the package and service layouts these repositories use.
    A directory wider than NESTED_WIDE_DIR entries is a source tree rather than a
    package root and is not descended into, and the whole walk stops after
    NESTED_VISIT_BUDGET directories so a large repository cannot make this slow.
    """
    found: list[str] = []
    budget = NESTED_VISIT_BUDGET

    def walk(current: Path, level: int) -> None:
        nonlocal budget
        if level > depth or budget <= 0:
            return
        try:
            entries = list(current.iterdir())
        except OSError:
            return
        if len(entries) > NESTED_WIDE_DIR:
            return
        children = [
            entry for entry in entries
            if entry.is_dir() and not entry.name.startswith(".") and entry.name not in SKIP_DIRS
        ]
        for child in children:
            if budget <= 0:
                return
            budget -= 1
            for name in GUIDE_NAMES:
                guide = child / name
                if guide.is_file():
                    found.append(str(guide.relative_to(root)))
            walk(child, level + 1)

    walk(root, 1)
    return found


def repo_standards(root: Path) -> list[str]:
    """Team-owned instruction surfaces present in a repository."""
    if not root.is_dir():
        return []
    found: list[str] = []
    for name in GUIDE_NAMES:
        if (root / name).is_file():
            found.append(name)
    for name in ("THEME.md", "docs/AI_REFERENCE.md"):
        if (root / name).is_file():
            found.append(name)
    claude = root / ".claude"
    if claude.is_dir():
        for name in ("skills", "agents", "hooks"):
            directory = claude / name
            if directory.is_dir():
                try:
                    count = len([entry for entry in directory.iterdir() if not entry.name.startswith(".")])
                except OSError:
                    count = 0
                if count:
                    found.append(f".claude/{name}({count})")
        if (claude / "settings.json").is_file():
            found.append(".claude/settings.json")
    found.extend(nested_guides(root))
    return found
