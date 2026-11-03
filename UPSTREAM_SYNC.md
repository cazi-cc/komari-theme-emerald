# Upstream synchronization

A weekly workflow and manual dispatch merge upstream into the existing review branch.
The repository and branch mappings, required fork files and validation commands are
in `.github/upstream-sync.json`. Update that contract when moving a custom module.

The workflow never force-pushes and does not reset a remote review branch to the
base branch. Human resolution commits are retained. A new conflicting merge opens
a draft PR using real upstream commits, never a report-only commit. A conflict on
an existing review branch preserves its head and marks the PR as draft. Conflicts
and validation errors fail visibly; diagnostics are retained for 14 days.

Clean merges run every configured validation command before publishing. Required
custom paths cannot disappear. The PR lists changed protected paths for review;
there is no automatic merge. A source merge does not deploy a server. Agent snapshot
publication requires explicit manual dispatch, so source maintenance cannot silently
upgrade installed agents. Emerald retains the owner's rolling `v1.0.0` policy.

Resolve conflicts in the existing review branch, run the documented checks and then
merge through review. Future upstream feature changes may require real conflicts to
be resolved; synchronization must never silently discard either side to appear green.
