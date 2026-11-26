# Changelog: one file per entry, in a folder per day

- New entries go in `internal/changelog/<YYYY-MM-DD>/<slug>.md`, one file each, so two open PRs never conflict on the changelog.
- The month files (`2026-02.md` … `2026-11.md`) are history and stay as they are.
- The stray `internal/changelog.md` (265 entries from 8–26 November) is merged into `2026-11.md` by date, so there is one history again.
- `/changelog`, `/commit`, `/ship`, the feature demo and screenshot skills, CLAUDE.md and AGENTS.md point at the new layout.
