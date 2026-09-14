# Upstream sync requires manual resolution

- Upstream: `Tokinx/komari-theme-emerald:master`
- Base: `cazi-cc/komari-theme-emerald:master`
- Run: https://github.com/cazi-cc/komari-theme-emerald/actions/runs/34827053483

## Conflicting files

```text
.github/workflows/release-on-version-bump.yml
komari-theme.json
package.json
src/components/NodeCard.vue
src/components/PingChart.vue
src/composables/useNodePingDisplay.ts
src/composables/useNodePingStats.ts
src/utils/echarts.ts
```

## Fork-owned files to preserve

```text
src/views/UnlockQuality.vue
src/views/TCPQuality.vue
src/utils/unlockQuality.ts
src/utils/tcpQuality.ts
src/components/NodeCard.vue
src/views/ThemeSettingsApp.vue
README.md
.github/workflows/sync-upstream.yml
```

Do not merge this report-only commit. Resolve the upstream merge on this branch, delete this file, run the repository tests, and then update the pull request.
