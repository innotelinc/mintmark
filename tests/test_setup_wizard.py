"""Tests for scripts/setup-wizard.py — the guided first-install for Mintmark."""
from __future__ import annotations

import importlib.util
import io
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = """\
# Mintmark — copy to .env.
MINTMARK_API_KEY=

# Optional: the gateway root.
# MINTMARK_BASE_URL=https://gateway.innotel.us/v1
"""


def load_wizard():
    path = ROOT / "scripts" / "setup-wizard.py"
    spec = importlib.util.spec_from_file_location("mintmark_setup_wizard", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    # dataclasses resolves the class's module through sys.modules.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


wizard = load_wizard()


class Workspace:
    """A throwaway checkout holding only `.env.example`."""

    def __enter__(self) -> Path:
        self._dir = tempfile.TemporaryDirectory()
        root = Path(self._dir.name)
        (root / ".env.example").write_text(TEMPLATE)
        return root

    def __exit__(self, *exc_info) -> None:
        self._dir.cleanup()


def run(root: Path, *extra: str, stdin=None) -> tuple[int, str]:
    buffer = io.StringIO()
    argv = ["--root", str(root), "--skip-preflight", *extra]
    with redirect_stdout(buffer):
        code = wizard.main(argv)
    return code, buffer.getvalue()


class MergeEnvTest(unittest.TestCase):
    def test_replaces_owned_keys_and_keeps_comments(self) -> None:
        text = wizard.merge_env(
            "# header\nMINTMARK_API_KEY=\n# keep me\nMINTMARK_MODEL=old\n",
            {"MINTMARK_MODEL": "gemini/new", "MINTMARK_API_KEY": "mm_live_x"},
        )
        self.assertIn("# header", text)
        self.assertIn("# keep me", text)
        self.assertIn("MINTMARK_MODEL=gemini/new", text)
        self.assertIn("MINTMARK_API_KEY=mm_live_x", text)
        self.assertNotIn("MINTMARK_MODEL=old", text)

    def test_appends_a_key_the_template_does_not_have(self) -> None:
        text = wizard.merge_env("A=1\n", {"MINTMARK_DATA": "/root/mintmark-data"})
        self.assertIn("MINTMARK_DATA=/root/mintmark-data", text)


class ValuesTest(unittest.TestCase):
    def test_defaults_become_the_gateway_settings(self) -> None:
        values = wizard.gateway_values(wizard.Answers.defaults(), "")
        self.assertEqual(values["MINTMARK_BASE_URL"], "https://gateway.innotel.us/v1")
        self.assertEqual(values["MINTMARK_MODEL"], "gemini/gemini-3-flash-preview")
        self.assertEqual(values["MINTMARK_PORT"], "8930")
        self.assertEqual(values["MINTMARK_DATA"], "./data")

    def test_a_key_is_only_written_when_one_is_known(self) -> None:
        self.assertNotIn("MINTMARK_API_KEY", wizard.gateway_values(wizard.Answers.defaults(), ""))
        with_key = wizard.gateway_values(wizard.Answers.defaults(), "mm_live_abc")
        self.assertEqual(with_key["MINTMARK_API_KEY"], "mm_live_abc")


class ValidationTest(unittest.TestCase):
    def test_url_accepts_a_gateway_root(self) -> None:
        self.assertEqual(wizard.check_url("https://gateway.innotel.us/v1/"), "https://gateway.innotel.us/v1")
        self.assertEqual(wizard.check_url(" http://127.0.0.1:20128/v1 "), "http://127.0.0.1:20128/v1")

    def test_url_rejects_prose(self) -> None:
        with self.assertRaises(ValueError):
            wizard.check_url("the gateway")
        with self.assertRaises(ValueError):
            wizard.check_url("gateway.innotel.us/v1")

    def test_port_must_be_an_unprivileged_number(self) -> None:
        self.assertEqual(wizard.check_port("8930"), "8930")
        for bad in ("80", "eighty", "70000"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                wizard.check_port(bad)

    def test_model_needs_a_provider_prefix(self) -> None:
        self.assertEqual(wizard.check_model("gemini/gemini-3-flash-preview"), "gemini/gemini-3-flash-preview")
        with self.assertRaises(ValueError):
            wizard.check_model("flash")

    def test_data_dir_accepts_relative_and_absolute_paths(self) -> None:
        self.assertEqual(wizard.check_data_dir("./data"), "./data")
        self.assertEqual(wizard.check_data_dir("/root/mintmark-data"), "/root/mintmark-data")
        with self.assertRaises(ValueError):
            wizard.check_data_dir("my data")


class WriteTest(unittest.TestCase):
    def test_writes_a_private_file_once(self) -> None:
        with Workspace() as root:
            values = wizard.gateway_values(wizard.Answers.defaults(), "")
            self.assertTrue(wizard.write_env(root / ".env", TEMPLATE, values, force=False))
            mode = stat.S_IMODE(os.stat(root / ".env").st_mode)
            self.assertEqual(mode, 0o600)
            self.assertFalse(wizard.write_env(root / ".env", TEMPLATE, values, force=False))


class EndToEndTest(unittest.TestCase):
    def test_writes_env_from_the_template(self) -> None:
        with Workspace() as root:
            code, output = run(root, "--no-input", "--yes")
            self.assertEqual(code, 0)
            self.assertIn("Wrote", output)
            text = (root / ".env").read_text()
            self.assertIn("# Mintmark — copy to .env.", text)
            self.assertIn("MINTMARK_BASE_URL=https://gateway.innotel.us/v1", text)
            self.assertIn("MINTMARK_PORT=8930", text)
            self.assertEqual(stat.S_IMODE(os.stat(root / ".env").st_mode), 0o600)

    def test_dry_run_writes_nothing(self) -> None:
        with Workspace() as root:
            code, output = run(root, "--no-input", "--dry-run")
            self.assertEqual(code, 0)
            self.assertIn("Dry run", output)
            self.assertFalse((root / ".env").exists())

    def test_second_run_keeps_the_file(self) -> None:
        with Workspace() as root:
            run(root, "--no-input", "--yes")
            first = (root / ".env").read_text()
            code, output = run(root, "--no-input", "--yes")
            self.assertEqual(code, 0)
            self.assertIn("Kept existing", output)
            self.assertEqual((root / ".env").read_text(), first)

    def test_missing_template_is_an_error(self) -> None:
        with tempfile.TemporaryDirectory() as empty:
            code, _ = run(Path(empty), "--no-input", "--yes")
            self.assertEqual(code, 1)


class EntryPointTest(unittest.TestCase):
    def test_setup_sh_runs_the_wizard(self) -> None:
        script = ROOT / "setup.sh"
        self.assertTrue(script.exists())
        self.assertTrue(os.access(script, os.X_OK))
        with Workspace() as root:
            result = subprocess.run(
                ["sh", str(script), "--no-input", "--dry-run", "--skip-preflight", "--root", str(root)],
                capture_output=True,
                text=True,
                cwd=ROOT,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Plan", result.stdout)
            self.assertFalse((root / ".env").exists())


class ForcePreservationTest(unittest.TestCase):
    def test_force_keeps_the_gateway_key_and_operator_keys(self) -> None:
        with Workspace() as root:
            (root / ".env").write_text(
                "MINTMARK_API_KEY=mm_live_existing\n"
                "MINTMARK_BASE_URL=https://old-gateway.example/v1\n"
                "EXTRA_OPERATOR_SETTING=keep-me\n"
            )
            code, _ = run(root, "--force", "--no-input", "--yes")
            self.assertEqual(code, 0)
            text = (root / ".env").read_text()
            self.assertIn("MINTMARK_API_KEY=mm_live_existing", text)
            self.assertIn("EXTRA_OPERATOR_SETTING=keep-me", text)
            # Identity values still come from the wizard's answers.
            self.assertIn("MINTMARK_BASE_URL=https://gateway.innotel.us/v1", text)
            self.assertNotIn("MINTMARK_BASE_URL=https://old-gateway.example/v1", text)


class MockedInputTest(unittest.TestCase):
    def test_answers_are_used_and_a_blank_key_keeps_the_existing_one(self) -> None:
        with Workspace() as root:
            (root / ".env").write_text("MINTMARK_API_KEY=mm_live_kept\n")
            answers = ["https://gateway.example/v1", "openai/vision-1", "9000", "/srv/mintmark"]
            with patch("builtins.input", side_effect=answers), patch.object(
                wizard.getpass, "getpass", return_value=""
            ):
                code, output = run(root, "--force", "--yes")
            self.assertEqual(code, 0)
            text = (root / ".env").read_text()
            self.assertIn("MINTMARK_API_KEY=mm_live_kept", text)
            self.assertIn("MINTMARK_BASE_URL=https://gateway.example/v1", text)
            self.assertIn("MINTMARK_MODEL=openai/vision-1", text)
            self.assertIn("MINTMARK_PORT=9000", text)
            self.assertIn("MINTMARK_DATA=/srv/mintmark", text)
            self.assertNotIn("mm_live_kept", output)  # never printed

    def test_a_new_key_replaces_the_stored_one(self) -> None:
        with Workspace() as root:
            (root / ".env").write_text("MINTMARK_API_KEY=mm_live_old\n")
            answers = ["https://gateway.innotel.us/v1", "gemini/gemini-3-flash-preview", "8930", "./data"]
            with patch("builtins.input", side_effect=answers), patch.object(
                wizard.getpass, "getpass", return_value="mm_live_new"
            ):
                code, _ = run(root, "--force", "--yes")
            self.assertEqual(code, 0)
            self.assertIn("MINTMARK_API_KEY=mm_live_new", (root / ".env").read_text())


class HooksTest(unittest.TestCase):
    def test_installs_the_attribution_guards(self) -> None:
        with Workspace() as root:
            subprocess.run(("git", "init", "-q"), cwd=root, check=True, capture_output=True)
            hooks = root / ".githooks"
            hooks.mkdir()
            for name in ("commit-msg", "pre-commit"):
                path = hooks / name
                path.write_text("#!/bin/sh\nexit 0\n")
                os.chmod(path, 0o644)
            code, output = run(root, "--no-input", "--yes")
            self.assertEqual(code, 0)
            self.assertIn("Attribution guards installed", output)
            config = subprocess.run(
                ("git", "config", "--get", "core.hooksPath"),
                cwd=root,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(config.stdout.strip(), ".githooks")
            for name in ("commit-msg", "pre-commit"):
                self.assertTrue(os.access(hooks / name, os.X_OK), name)

    def test_a_checkout_without_git_is_fine(self) -> None:
        with Workspace() as root:
            code, output = run(root, "--no-input", "--yes")
            self.assertEqual(code, 0)
            self.assertNotIn("Attribution guards installed", output)


if __name__ == "__main__":
    unittest.main()
