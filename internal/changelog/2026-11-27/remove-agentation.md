# Remove agentation

- Deleted `DevAgentation.tsx`, its commented-out mount in `routes/__root.tsx` and the `agentation` dependency (lockfile edited by hand: no registry access).
- The preview proxy no longer routes `/__agentation` to port 4747. `SCRIPT_VERSION` is `stream-v35`, so running proxies relaunch.
- The snapshot seed no longer installs `agentation-mcp`. The next seed starts from a changed install line.
