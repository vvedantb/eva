## Remove Run Dev Server and Run Background Commands menu items - 2026-11-26

- The task footer and header More menus no longer offer Run Dev Server or Run Background Commands. The Run dev server confirm dialog is gone.
- Deleted the `sessions.runDevServer` and `sessions.runBackgroundCommands` public mutations and `SandboxCommandMenuItems`. Agents still restart these through the Eva MCP tools.
