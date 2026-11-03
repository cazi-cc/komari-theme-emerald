import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("sync_upstream", Path(__file__).with_name("sync_upstream.py"))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class ReviewMergeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        self.commit("shared.txt", "original\n")
        self.initial = self.head()
        self.config = {"base_branch": "main", "upstream_branch": "main",
                       "sync_branch": "sync/upstream-main", "protected_paths": ["custom.txt"]}

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.root), *args], text=True,
                                       stderr=subprocess.DEVNULL).strip()

    def commit(self, path, text):
        (self.root / path).write_text(text)
        self.git("add", path)
        self.git("commit", "-m", path)

    def head(self):
        return self.git("rev-parse", "HEAD")

    def ref(self, name, sha=None):
        self.git("update-ref", "refs/remotes/" + name, sha or self.head())

    def upstream(self, path="upstream.txt", text="new upstream\n"):
        self.git("checkout", "-b", "vendor", self.initial)
        self.commit(path, text)
        self.ref("upstream/main")
        self.git("checkout", "main")

    def test_clean_merge_keeps_custom_code_and_upstream_ancestry(self):
        self.upstream()
        self.commit("custom.txt", "custom probe\n")
        self.ref("origin/main")
        result = sync.prepare(self.root, self.config)
        self.assertEqual(result["status"], "merged")
        self.assertEqual((self.root / "custom.txt").read_text(), "custom probe\n")
        self.assertTrue((self.root / "upstream.txt").is_file())
        self.git("merge-base", "--is-ancestor", "upstream/main", "HEAD")

    def test_next_run_preserves_manual_resolution_commits(self):
        self.upstream()
        self.ref("origin/main")
        self.commit("custom.txt", "manual resolution\n")
        manual = self.head()
        self.ref("origin/sync/upstream-main", manual)
        result = sync.prepare(self.root, self.config)
        self.assertEqual(result["status"], "merged")
        self.git("merge-base", "--is-ancestor", manual, "HEAD")
        self.assertEqual((self.root / "custom.txt").read_text(), "manual resolution\n")

    def test_first_conflict_uses_real_upstream_not_report_only_commit(self):
        self.upstream("shared.txt", "upstream rewrite\n")
        upstream = self.git("rev-parse", "upstream/main")
        self.commit("shared.txt", "custom rewrite\n")
        self.ref("origin/main")
        result = sync.prepare(self.root, self.config)
        self.assertEqual(result["status"], "conflict")
        self.assertTrue(result["publish_conflict_branch"])
        self.assertEqual(result["conflicts"], ["shared.txt"])
        self.assertEqual(self.head(), upstream)
        self.assertFalse((self.root / ".github/UPSTREAM_SYNC_CONFLICTS.md").exists())

    def test_conflict_never_overwrites_existing_manual_branch(self):
        self.upstream("shared.txt", "upstream rewrite\n")
        self.ref("origin/main")
        self.commit("shared.txt", "manual resolution\n")
        manual = self.head()
        self.ref("origin/sync/upstream-main", manual)
        result = sync.prepare(self.root, self.config)
        self.assertEqual(result["status"], "conflict")
        self.assertFalse(result["publish_conflict_branch"])
        self.assertEqual(self.head(), manual)
        self.assertEqual(self.git("rev-parse", "origin/sync/upstream-main"), manual)
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_current_upstream_is_a_no_op(self):
        self.ref("origin/main")
        self.ref("upstream/main")
        before = self.head()
        result = sync.prepare(self.root, self.config)
        self.assertEqual(result["status"], "current")
        self.assertEqual(self.head(), before)

    def test_uncommitted_work_is_never_validated_as_a_publishable_commit(self):
        self.upstream()
        self.ref("origin/main")
        (self.root / "shared.txt").write_text("uncommitted human edit\n")
        with self.assertRaisesRegex(RuntimeError, "clean"):
            sync.prepare(self.root, self.config)
        self.assertEqual((self.root / "shared.txt").read_text(), "uncommitted human edit\n")


if __name__ == "__main__":
    unittest.main()
