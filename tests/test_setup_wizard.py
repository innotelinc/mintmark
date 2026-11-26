"""Tests for scripts/setup-wizard.py — the guided first-install for Mintmark."""
from __future__ import annotations

import http.server
import importlib.util
import io
import json
import os
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import unittest
from contextlib import contextmanager, redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch

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


def run_doctor(root: Path) -> tuple[int, str]:
    buffer = io.StringIO()
    with redirect_stdout(buffer):
        code = wizard.doctor(root)
    return code, buffer.getvalue()


class StubService(http.server.BaseHTTPRequestHandler):
    """Answers the two endpoints --doctor talks to, as the real ones do."""

    health = {"ok": True}

    def do_GET(self):
        status, body = 404, {"error": "not found"}
        if self.path == "/api/health":
            status, body = 200, self.health
        elif self.path == "/v1/models":
            if self.headers.get("Authorization") == "Bearer mm_live_stub":
                status, body = 200, {"data": [{"id": "gemini/gemini-3-flash-preview"}, {"id": "gemini/gemini-4-argon"}]}
            else:
                status, body = 401, {"error": "unauthorized"}
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass


class UnhealthyService(StubService):
    health = {"ok": False}


@contextmanager
def stub_service(handler=StubService):
    """Serve the stub on a free loopback port for the length of the block."""
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


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


class ProbeHttpTest(unittest.TestCase):
    """The probes over a real socket, so CI covers their HTTP handling."""

    def test_health_reads_the_workers_answer(self) -> None:
        with stub_service() as port:
            ok, detail = wizard.probe_health(port, timeout=5)
        self.assertTrue(ok, detail)
        self.assertIn("/api/health -> 200", detail)

    def test_health_rejects_a_service_that_does_not_say_ok(self) -> None:
        with stub_service(UnhealthyService) as port:
            ok, detail = wizard.probe_health(port, timeout=5)
        self.assertFalse(ok)
        self.assertIn("unexpected body", detail)

    def test_health_reports_a_closed_port(self) -> None:
        ok, detail = wizard.probe_health(free_port(), timeout=2)
        self.assertFalse(ok)
        self.assertIn("/api/health", detail)

    def test_gateway_accepts_the_key_and_counts_the_models(self) -> None:
        with stub_service() as port:
            ok, detail = wizard.probe_gateway(f"http://127.0.0.1:{port}/v1", "mm_live_stub", timeout=5)
        self.assertTrue(ok, detail)
        self.assertIn("200 (2 models)", detail)

    def test_gateway_reports_a_rejected_key(self) -> None:
        with stub_service() as port:
            ok, detail = wizard.probe_gateway(f"http://127.0.0.1:{port}/v1", "mm_live_wrong", timeout=5)
        self.assertFalse(ok)
        self.assertIn("HTTP 401", detail)

    def test_gateway_reports_an_unreachable_host(self) -> None:
        ok, detail = wizard.probe_gateway(f"http://127.0.0.1:{free_port()}/v1", "mm_live_stub", timeout=2)
        self.assertFalse(ok)
        self.assertIn("/v1/models", detail)


class DoctorTest(unittest.TestCase):
    def healthy(self, root: Path, gateway: tuple[bool, str] = (True, "models -> 200")):
        """Answer every probe as the real service would."""
        return patch.multiple(
            wizard,
            port_available=Mock(return_value=True),
            probe_health=Mock(return_value=(True, "health -> 200")),
            probe_gateway=Mock(return_value=gateway),
        )

    def test_passes_when_the_install_answers(self) -> None:
        with Workspace() as root:
            (root / ".env").write_text("MINTMARK_API_KEY=mm_live_x\nMINTMARK_PORT=8930\n")
            with self.healthy(root):
                code, output = run_doctor(root)
            self.assertEqual(code, 0)
            self.assertIn("Install looks healthy.", output)
            self.assertIn("gateway key", output)
            self.assertIn("published port", output)
            self.assertIn("data directory", output)

    def test_health_failure_fails_the_check(self) -> None:
        with Workspace() as root:
            (root / ".env").write_text("MINTMARK_PORT=8930\n")
            with patch.object(wizard, "probe_health", return_value=(False, "health -> refused")), patch.object(
                wizard, "port_available", return_value=True
            ):
                code, output = run_doctor(root)
            self.assertEqual(code, 1)
            self.assertIn("fail  health", output)
            self.assertIn("1 check(s) failed.", output)

    def test_an_unset_key_is_a_warning_not_a_failure(self) -> None:
        with Workspace() as root:
            (root / ".env").write_text("MINTMARK_PORT=8930\n")
            with self.healthy(root):
                code, output = run_doctor(root)
            self.assertEqual(code, 0)
            self.assertIn("not set", output)

    def test_a_rejected_key_fails_the_check(self) -> None:
        with Workspace() as root:
            (root / ".env").write_text("MINTMARK_API_KEY=mm_live_wrong\nMINTMARK_PORT=8930\n")
            with self.healthy(root, gateway=(False, "models -> HTTP 401")):
                code, output = run_doctor(root)
            self.assertEqual(code, 1)
            self.assertIn("HTTP 401", output)

    def test_a_missing_env_file_is_reported_and_nothing_is_written(self) -> None:
        with Workspace() as root:
            with self.healthy(root):
                code, output = run_doctor(root)
            self.assertEqual(code, 0)
            self.assertIn("missing — run ./setup.sh first", output)
            self.assertFalse((root / ".env").exists())

    @unittest.skipIf(getattr(os, "geteuid", lambda: -1)() == 0, "root can write anywhere")
    def test_an_unwritable_data_directory_fails_the_check(self) -> None:
        with Workspace() as root:
            data = root / "data"
            data.mkdir()
            os.chmod(data, 0o500)
            (root / ".env").write_text(f"MINTMARK_DATA={data}\nMINTMARK_PORT=8930\n")
            try:
                with self.healthy(root):
                    code, output = run_doctor(root)
            finally:
                os.chmod(data, 0o700)
            self.assertEqual(code, 1)
            self.assertIn("not writable", output)


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
