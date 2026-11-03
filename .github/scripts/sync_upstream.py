#!/usr/bin/env python3
"""Merge upstream on a review branch without destroying manual resolutions."""
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


def git(root, *args, check=True):
    return subprocess.run(["git", "-C", str(root), *args], text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=check)


def attempt_merge(root, ref):
    result = git(root, "merge", "--no-edit", ref, check=False)
    if result.returncode == 0:
        return []
    conflicts = git(root, "diff", "--name-only", "--diff-filter=U").stdout.splitlines()
    git(root, "merge", "--abort", check=False)
    if not conflicts:
        raise RuntimeError(result.stdout)
    return conflicts


def prepare(root, config):
    """Only local refs are changed here. Failed merges leave remote refs intact."""
    if git(root, "status", "--porcelain").stdout.strip():
        raise RuntimeError("The checkout must be clean before synchronizing upstream")
    base = "origin/" + config["base_branch"]
    upstream = "upstream/" + config["upstream_branch"]
    branch = config["sync_branch"]
    ancestor = git(root, "merge-base", "--is-ancestor", upstream, base, check=False)
    if ancestor.returncode == 0:
        return {"status": "current", "base": git(root, "rev-parse", base).stdout.strip(),
                "upstream": git(root, "rev-parse", upstream).stdout.strip()}
    if ancestor.returncode != 1:
        raise RuntimeError(ancestor.stdout)
    remote = "origin/" + branch
    exists = git(root, "rev-parse", "--verify", remote, check=False).returncode == 0
    start = remote if exists else base
    git(root, "checkout", "-B", branch, start)
    original = git(root, "rev-parse", "HEAD").stdout.strip()
    for ref in (base, upstream):
        conflicts = attempt_merge(root, ref)
        if conflicts:
            # Restore any successful first merge too; all pre-existing human
            # commits remain reachable from the untouched remote branch.
            git(root, "reset", "--hard", original)
            if not exists:
                # A real upstream branch gives GitHub a real conflicted PR.
                # Never manufacture a report-only commit on the base branch.
                git(root, "checkout", "-B", branch, upstream)
            return {"status": "conflict", "conflicts": conflicts,
                    "publish_conflict_branch": not exists, "original_head": original,
                    "base": git(root, "rev-parse", base).stdout.strip(),
                    "upstream": git(root, "rev-parse", upstream).stdout.strip()}
    return {"status": "merged", "base": git(root, "rev-parse", base).stdout.strip(),
            "upstream": git(root, "rev-parse", upstream).stdout.strip(),
            "head": git(root, "rev-parse", "HEAD").stdout.strip(),
            "protected_changes": git(root, "diff", "--name-only", base + "..HEAD", "--",
                                      *config["protected_paths"]).stdout.splitlines()}


class GitHub:
    def __init__(self, repository, token):
        self.url = "https://api.github.com/repos/" + repository
        self.repository = repository
        self.token = token

    def api(self, method, suffix, data=None):
        url = "https://api.github.com/graphql" if suffix == "/graphql" else self.url + suffix
        request = urllib.request.Request(url,
            data=None if data is None else json.dumps(data).encode(), method=method,
            headers={"Authorization": "Bearer " + self.token,
                     "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28",
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
            return json.loads(payload) if payload else {}

    def review(self, config, result):
        owner = self.repository.split("/")[0]
        query = urllib.parse.urlencode({"state": "open", "head": owner + ":" + config["sync_branch"],
                                        "base": config["base_branch"]})
        prs = self.api("GET", "/pulls?" + query)
        conflict = result["status"] == "conflict"
        title = "chore: " + ("resolve " if conflict else "sync ") + config["upstream_repository"] + " upstream"
        body = ("Upstream: `" + result["upstream"] + "`\n\nBase: `" + result["base"] + "`\n\n")
        if conflict:
            body += "The upstream merge has real code conflicts. No report-only commit was created. "
            body += "Existing manual resolutions have been preserved. Resolve and validate before merging.\n\n```text\n"
            body += "\n".join(result["conflicts"]) + "\n```\n"
        else:
            body += "The complete configured validation commands passed on this merge. "
            body += "Review the custom probe, privacy, traffic ledger and release contracts before merging.\n\n"
            if result["protected_changes"]:
                body += "Fork-owned paths changed (manual review required):\n\n```text\n"
                body += "\n".join(result["protected_changes"]) + "\n```\n"
        body += "\nSource synchronization does not deploy a server or authorize an Agent rollout.\n"
        if prs:
            if conflict and not prs[0]["draft"]:
                answer = self.api("POST", "/graphql", {
                    "query": "mutation($id: ID!) { convertPullRequestToDraft(input: {pullRequestId: $id}) { pullRequest { id } } }",
                    "variables": {"id": prs[0]["node_id"]}})
                if answer.get("errors"):
                    raise RuntimeError("Could not mark the conflicted PR as draft")
            self.api("PATCH", "/pulls/" + str(prs[0]["number"]), {"title": title, "body": body})
            return prs[0]["html_url"]
        if conflict and not result.get("publish_conflict_branch"):
            return None
        created = self.api("POST", "/pulls", {"title": title, "body": body,
            "head": config["sync_branch"], "base": config["base_branch"], "draft": conflict})
        return created["html_url"]


def main():
    root = Path.cwd()
    config = json.loads((root / ".github/upstream-sync.json").read_text())
    repository = os.environ["GITHUB_REPOSITORY"]
    token = os.environ["GH_TOKEN"]
    artifact = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "upstream-sync"
    artifact.mkdir(parents=True, exist_ok=True)
    git(root, "config", "user.name", "cazi-upstream-sync")
    git(root, "config", "user.email", "actions@users.noreply.github.com")
    git(root, "remote", "remove", "upstream", check=False)
    git(root, "remote", "add", "upstream", "https://github.com/" + config["upstream_repository"] + ".git")
    git(root, "fetch", "--no-tags", "upstream", config["upstream_branch"])
    git(root, "fetch", "--no-tags", "origin", config["base_branch"])
    git(root, "fetch", "--no-tags", "origin", config["sync_branch"], check=False)
    result = prepare(root, config)
    (artifact / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    summary = Path(os.environ["GITHUB_STEP_SUMMARY"])
    if result["status"] == "current":
        with summary.open("a") as stream:
            stream.write("## Upstream source is current\n\nAll upstream commits are already in the base branch.\n")
        return 0
    github = GitHub(repository, token)
    if result["status"] == "conflict":
        if result["publish_conflict_branch"]:
            git(root, "push", "origin", "HEAD:refs/heads/" + config["sync_branch"])
        url = github.review(config, result)
        with summary.open("a") as stream:
            stream.write("## Manual conflict resolution required\n\n" + (url or "Existing branch preserved.") + "\n")
        return 1
    missing = [path for path in config.get("required_paths", []) if not (root / path).is_file()]
    if missing:
        raise RuntimeError("Fork-owned files removed: " + ", ".join(missing))
    with (artifact / "validation.log").open("w") as stream:
        for command in config["validation_commands"]:
            stream.write("$ " + " ".join(command) + "\n")
            stream.flush()
            completed = subprocess.run(command, cwd=root, stdout=stream, stderr=subprocess.STDOUT)
            if completed.returncode:
                result["status"] = "validation_failed"
                result["failed_command"] = command
                (artifact / "result.json").write_text(json.dumps(result, indent=2) + "\n")
                with summary.open("a") as report:
                    report.write("## Upstream validation failed\n\nNo branch was published. See validation.log.\n")
                return completed.returncode
    # Normal fast-forward pushes only: a concurrent user's update is never lost.
    git(root, "push", "origin", "HEAD:refs/heads/" + config["sync_branch"])
    url = github.review(config, result)
    with summary.open("a") as stream:
        stream.write("## Upstream merge validated and ready for review\n\n" + url + "\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, subprocess.CalledProcessError, urllib.error.URLError) as error:
        print("Upstream synchronization failed:", str(error), file=sys.stderr)
        sys.exit(1)
