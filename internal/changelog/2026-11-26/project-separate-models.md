# Projects: one model, picked in Eva's chat

- Eva and every task she runs use the model and account picked in Eva's chat composer. A wake used the project's model before; a task copied the project's model at its first run.
- A task takes Eva's model when it starts (and again after a usage limit stops it), as it took the project's before (`projectRunSettings`). A pick in the task's own chat after that stays the task's.
- The Project page (web and phone) no longer has a model row. `projects.model` only seeds Eva's chat when it is first made.
- Filters and labels on the Tasks list moved to v4 in the orchestrator plan.
