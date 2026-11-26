---
model: haiku
---

Review all changes made in this conversation and add one new entry file: `internal/changelog/<YYYY-MM-DD>/<slug>.md`, in today's date folder (create the folder if it does not exist). The slug is the entry's title in short kebab case. One file per entry, so two PRs never conflict. Never edit the month files (`internal/changelog/<YYYY-MM>.md`); they are history.

Format: `# <Title>` followed by bullet points describing each change.

Rules:

- Only add entries for medium-to-large changes/features, not quick fixes or bug fixes
- Each bullet should describe what changed and why, not implementation details
- Keep bullets concise (one line each)
- If multiple features were implemented, group them in one file if related, or create separate files if unrelated
