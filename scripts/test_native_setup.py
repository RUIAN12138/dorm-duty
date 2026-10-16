"""Use disposable credentials only; never access a user's service config."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

script = Path(__file__).with_name("configure-native-push.py")
spec = importlib.util.spec_from_file_location("native_setup", script)
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class NativeSetupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.target = self.directory / "native-push.json"

    def tearDown(self):
        self.temporary.cleanup()

    def test_preserve_other_platform_and_private_mode(self):
        setup.save(self.directory, "harmony", "a" * 24, "b" * 32)
        setup.save(self.directory, "android", "c" * 24, "d" * 32)
        config = setup.load(self.directory)
        self.assertEqual(set(config), {"harmony", "android"})
        self.assertEqual(config["harmony"]["masterSecret"], "b" * 32)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)
        self.assertFalse(list(self.directory.glob(".native-push-*")))

    def test_invalid_update_preserves_original(self):
        setup.save(self.directory, "android", "c" * 24, "d" * 32)
        original = self.target.read_bytes()
        with self.assertRaises(ValueError):
            setup.save(self.directory, "android", "c" * 24, "invalid")
        self.assertEqual(self.target.read_bytes(), original)

    def test_symlink_is_not_followed(self):
        real = self.directory / "other.json"
        real.write_text("{}"); real.chmod(0o600)
        self.target.symlink_to(real)
        with self.assertRaises(ValueError):
            setup.save(self.directory, "android", "c" * 24, "d" * 32)
        self.assertEqual(real.read_text(), "{}")

    def test_world_readable_existing_config_is_rejected(self):
        self.target.write_text("{}"); self.target.chmod(0o644)
        with self.assertRaises(ValueError):
            setup.load(self.directory)

    def test_status_never_prints_credentials(self):
        setup.save(self.directory, "android", "c" * 24, "d" * 32)
        result = subprocess.run([sys.executable, str(script), "--directory", str(self.directory), "--check"], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), {"android": True, "harmony": False})
        self.assertNotIn("d" * 32, result.stdout + result.stderr)
        self.assertNotIn("c" * 24, result.stdout + result.stderr)

    def test_noninteractive_input_never_creates_config(self):
        result = subprocess.run([sys.executable, str(script), "android", "--directory", str(self.directory), "--app-key", "c" * 24], input="d" * 32, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.target.exists())
        self.assertNotIn("d" * 32, result.stdout + result.stderr)

    def test_cli_supports_systemd_state_directory_link(self):
        actual = self.directory / "private"; actual.mkdir()
        exposed = self.directory / "state"; exposed.symlink_to(actual, target_is_directory=True)
        result = subprocess.run([sys.executable, str(script), "--directory", str(exposed), "--check"], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), {"android": False, "harmony": False})


if __name__ == "__main__":
    unittest.main()
