#!/usr/bin/env python3
"""Mintmark — guided setup wizard for a fresh install.

`./setup.sh` runs this. It asks for the values that cannot be guessed from the
checkout — the gateway root, the model the gateway routes, and the port and data
directory the self-hosted compose file publishes — then writes `.env` (mode
600) from `.env.example`, keeping that file's comments.

It is deliberately conservative:

- an existing `.env` is left untouched unless `--force` is given;
- on `--force`, a gateway key that is already set is kept, and keys the wizard
  does not own survive, so a re-run cannot rotate a working key or drop an
  operator's own settings;
- the gateway key is read without echo and is never printed.

`--check` preflights only, `--no-input` accepts every default, `--dry-run`
prints the plan without touching disk, and `--root` points it at a checkout
other than the one holding this script.
"""
from __future__ import annotations

import argparse
import getpass
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

KEY = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")
URL = re.compile(r"^https?://[^\s/]+(?::\d+)?(?:/[^\s]*)?$")
MODEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._:-]*$")
PATHLIKE = re.compile(r"^(?:/|\.{1,2}/|[A-Za-z0-9_])[A-Za-z0-9_./~+-]*$")
SAFE = re.compile(r"^[A-Za-z0-9_./:@,+%=-]+$")

DEFAULT_BASE_URL = "https://gateway.innotel.us/v1"
DEFAULT_MODEL = "gemini/gemini-3-flash-preview"
DEFAULT_PORT = "8930"
DEFAULT_DATA_DIR = "./data"

REQUIRED_TOOLS = (
    ("node", ("node", "--version")),
    ("npm", ("npm", "--version")),
    ("python3", (sys.executable, "--version")),
    ("curl", ("curl", "--version")),
)
OPTIONAL_TOOLS = (
    ("docker", ("docker", "--version")),
    ("docker compose", ("docker", "compose", "version")),
)


@dataclass(frozen=True)
class Answers:
    base_url: str
    model: str
    port: str
    data_dir: str

    @classmethod
    def defaults(cls) -> "Answers":
        return cls(
            base_url=DEFAULT_BASE_URL,
            model=DEFAULT_MODEL,
            port=DEFAULT_PORT,
            data_dir=DEFAULT_DATA_DIR,
        )


def env_value(value: str) -> str:
    """Quote a value only when dotenv needs it."""
    if value and SAFE.match(value):
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def read_env(path: Path) -> dict[str, str]:
    """Every KEY=value in a file, unquoted just enough to compare."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text().splitlines():
        match = KEY.match(line)
        if match:
            values[match.group(1)] = match.group(2).strip().strip('"')
    return values


def merge_env(template: str, values: dict[str, str]) -> str:
    """Replace the keys we own, keep every comment and unknown line."""
    lines: list[str] = []
    written: set[str] = set()
    for line in template.splitlines():
        match = KEY.match(line)
        if match and match.group(1) in values:
            key = match.group(1)
            lines.append(f"{key}={env_value(values[key])}")
            written.add(key)
        else:
            lines.append(line)
    for key, value in values.items():
        if key not in written:
            lines.append(f"{key}={env_value(value)}")
    return "\n".join(lines) + "\n"


def gateway_values(answers: Answers, api_key: str) -> dict[str, str]:
    """The `.env` keys the wizard owns, plus the key when one is known."""
    values = {
        "MINTMARK_BASE_URL": answers.base_url,
        "MINTMARK_MODEL": answers.model,
        "MINTMARK_PORT": answers.port,
        "MINTMARK_DATA": answers.data_dir,
    }
    if api_key:
        values["MINTMARK_API_KEY"] = api_key
    return values


def check_url(value: str) -> str:
    value = value.strip().rstrip("/")
    if not URL.match(value):
        raise ValueError("enter an http(s) URL such as https://gateway.innotel.us/v1")
    return value


def check_model(value: str) -> str:
    value = value.strip()
    if not MODEL.match(value):
        raise ValueError("enter a model id such as gemini/gemini-3-flash-preview")
    return value


def check_port(value: str) -> str:
    value = value.strip()
    if not value.isdigit() or not 1024 <= int(value) <= 65535:
        raise ValueError("enter a port between 1024 and 65535")
    return value


def check_data_dir(value: str) -> str:
    value = value.strip()
    if not PATHLIKE.match(value):
        raise ValueError("enter a path such as ./data or /root/mintmark-data")
    return value


def ask(label: str, default: str, check=None) -> str:
    while True:
        try:
            raw = input(f"{label} [{default}]: ").strip()
        except EOFError:
            return default
        value = raw or default
        if check is None:
            return value
        try:
            return check(value)
        except ValueError as error:
            print(f"  {error}")


def ask_secret(label: str) -> str:
    """Read a key without echo; a blank answer keeps whatever is already set."""
    try:
        return getpass.getpass(f"{label} [press Enter to keep]: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return ""


def preflight() -> int:
    missing = []
    for name, command in REQUIRED_TOOLS:
        if shutil.which(command[0]) is None and command[0] != sys.executable:
            missing.append(name)
            continue
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            missing.append(name)
    if missing:
        print("Missing required tools: " + ", ".join(missing), file=sys.stderr)
        return 1
    absent = [name for name, command in OPTIONAL_TOOLS if shutil.which(command[0]) is None]
    note = f" (optional, absent: {', '.join(absent)})" if absent else ""
    print("Preflight ok: " + ", ".join(name for name, _ in REQUIRED_TOOLS) + note)
    return 0


def write_env(path: Path, template: str, values: dict[str, str], force: bool) -> bool:
    """Write the env file; False when an existing file was kept."""
    if path.exists() and not force:
        return False
    # Start from what the operator already has, then apply the answers. A key
    # that is already set and not replaced here therefore survives --force.
    merged = read_env(path)
    merged.update(values)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(merge_env(template, merged))
    os.chmod(path, 0o600)
    return True


HOOK_FILES = ("commit-msg", "pre-commit")


def install_hooks(root: Path) -> bool:
    """Point git at the tracked attribution guards and make them executable.

    Git silently ignores a hook it cannot execute, and these shipped mode 644
    once, so the chmod is part of installing them rather than a convenience.
    """
    hooks = root / ".githooks"
    if not (root / ".git").exists() or not hooks.is_dir():
        return False
    for name in HOOK_FILES:
        path = hooks / name
        if path.exists():
            os.chmod(path, 0o755)
    result = subprocess.run(
        ("git", "config", "core.hooksPath", ".githooks"),
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0


def parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="./setup.sh",
        description="Guided first-install wizard for Mintmark.",
    )
    parser.add_argument("--root", default=str(ROOT), help="checkout holding .env.example")
    parser.add_argument("--check", action="store_true", help="preflight the tools and exit")
    parser.add_argument("--no-input", action="store_true", help="accept every default")
    parser.add_argument("--yes", action="store_true", help="do not ask for confirmation")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    parser.add_argument("--force", action="store_true", help="replace an existing .env")
    parser.add_argument("--skip-preflight", action="store_true", help=argparse.SUPPRESS)
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    root = Path(args.root).resolve()

    if args.check:
        return preflight()
    if not args.skip_preflight:
        result = preflight()
        if result:
            return result

    existing = read_env(root / ".env")
    if args.no_input:
        answers = Answers.defaults()
        supplied_key = ""
    else:
        defaults = Answers.defaults()
        print()
        print("Gateway")
        base_url = ask("  Base URL", defaults.base_url, check_url)
        model = ask("  Model id", defaults.model, check_model)
        print()
        print("Self-hosted compose (compose.selfhost.yml)")
        port = ask("  Published port", defaults.port, check_port)
        data_dir = ask("  Data directory", defaults.data_dir, check_data_dir)
        print()
        print("Gateway key (optional: /admin can store one after the first boot)")
        supplied_key = ask_secret("  MINTMARK_API_KEY")
        answers = Answers(base_url=base_url, model=model, port=port, data_dir=data_dir)

    api_key = supplied_key or existing.get("MINTMARK_API_KEY", "")
    values = gateway_values(answers, api_key)

    print()
    print("Plan")
    print(f"  Gateway         {answers.base_url}")
    print(f"  Model           {answers.model}")
    print(f"  Compose port    {answers.port} -> 8080")
    print(f"  Data directory  {answers.data_dir}")
    if api_key:
        print("  Gateway key     kept (never printed)")
    else:
        print("  Gateway key     unset — paste it in /admin after the first boot")

    if args.dry_run:
        print()
        print("Dry run — no files written.")
        return 0

    if not (args.yes or args.no_input) and sys.stdin.isatty():
        reply = input("\nWrite these settings? [Y/n]: ").strip().lower()
        if reply not in ("", "y", "yes"):
            print("Nothing written.")
            return 1

    template_path = root / ".env.example"
    if not template_path.exists():
        print(f"Not a Mintmark checkout: missing {template_path}", file=sys.stderr)
        return 1
    template = template_path.read_text()

    print()
    if write_env(root / ".env", template, values, args.force):
        print(f"Wrote {root / '.env'} (mode 600)")
    else:
        print(f"Kept existing {root / '.env'} — pass --force to replace it")

    if install_hooks(root):
        print("Attribution guards installed (core.hooksPath .githooks)")
    elif (root / ".git").exists():
        print(
            "Could not install the attribution guards — run `git config core.hooksPath .githooks`",
            file=sys.stderr,
        )

    print()
    print("Next steps")
    print("  1. Install:        npm ci")
    print("  2. Develop:        npm run dev")
    print("  3. Self-host:      docker compose -f compose.selfhost.yml up -d --build")
    print("  4. Store the key:  /admin, or MINTMARK_API_KEY in the environment")
    print("  5. Verify:         curl -fsS http://127.0.0.1:8080/api/health")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
