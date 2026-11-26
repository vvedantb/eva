# Agents and Manager Ave link PRs and chats; issue cards; agents know Ave

- New `CHAT_LINKS_INSTRUCTION` (`prompts/shared.ts`) tells agents to write a pull request or issue as a full GitHub link, and a session, quick task, project or doc as its Eva path, so chat shows the hover card.
- Every chat agent gets it in the static chat instructions; Manager Ave gets it in its own prompt, and its status table now links each agent.
- GitHub issue links in chat now get a hover card (state, title, author, comment count). `@eva/shared` `parseGithubItemLink` replaces `parseGithubPrLink` and reads both `/pull/N` and `/issues/N`; the new `github.getIssueCard` action is ActionCache-backed (60s), like `getPullRequestCard`. PR and issue cards share one `GithubCard` layout.
- New `MANAGER_AVE_INSTRUCTION` tells every chat agent that Manager Ave exists, that a message can come from it, and to point users at it for multi-repo or multi-agent work.
