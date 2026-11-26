# Quick tasks: a failed first run shows in the chat

- A quick task whose first run failed or was cancelled opened an empty chat: `findFirstRunChatTurnRun` skipped failed runs, and task timelines no longer show runs. It now falls back to the latest failed or cancelled initial run when no run is in flight or succeeded.
- That turn shows the task prompt, the run's steps and a reply: the agent's last text, then `Error: …` (worded like a failed session turn). A cancelled run is marked Stopped.
- Server: a failed task run now keeps the agent's final text in `resultSummary` (`buildRunResultSummary`), so a question the agent stopped on (for example a run rejected by the commit gate) is not lost.
- Web only: the phone app has no quick-task first-run chat turn.
