# Emerald Analytics Cache

This optional server companion precomputes task-first ping comparison data for the
Emerald Cazi theme. It reads Komari configuration from SQLite in read-only mode
and obtains metric aggregates through Komari's public JSON-RPC API.

## Resource policy

- `1h`: every 5 minutes
- `6h`, `12h`, `24h`: every 10 minutes
- `72h`, `168h`: every 30 minutes
- one process at a time through a file lock
- `Nice=15`, idle I/O scheduling, `CPUQuota=30%`, `MemoryMax=192M`
- atomic JSON replacement; a failed run leaves the last good cache in place

The generated files belong in `/var/lib/emerald-analytics` and should be
exposed read-only at `/emerald-analytics/` by the existing reverse proxy.

## Manual verification

```bash
python3 /opt/komari/emerald-analytics-bin/emerald_analytics.py --group all
systemctl status emerald-analytics@fast.service --no-pager
systemctl list-timers 'emerald-analytics-*'
```
