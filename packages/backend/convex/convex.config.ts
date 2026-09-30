import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config.js";
import prosemirrorSync from "@convex-dev/prosemirror-sync/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import crons from "@convex-dev/crons/convex.config.js";
import actionCache from "@convex-dev/action-cache/convex.config.js";
import migrations from "@convex-dev/migrations/convex.config.js";

const app = defineApp();
app.use(presence);
app.use(prosemirrorSync);
app.use(workflow);
app.use(crons);
app.use(actionCache);
app.use(migrations);

export default app;
