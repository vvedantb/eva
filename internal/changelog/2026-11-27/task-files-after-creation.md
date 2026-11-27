# Add files to a task after creation

- The task page (quick tasks and the project task prompt card) has "Attach files" under the description. Images pasted while editing the description attach too. Same rules as the create modal: images, HTML, Markdown or text, 10 MB each, 5 per task.
- Backend: new `agentTasks.addAttachments` (access and archive checks, 5-file cap).
- A run now sends the task files the agent has not seen: all of them on the first run, then the ones uploaded after the previous run started.
- `acceptAttachmentFiles` holds the shared file check for the create modal and the task page.
- Phone app: not changed yet; it still only lists and removes task files.
