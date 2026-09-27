import { defineApp } from "convex/server";
import { v } from "convex/values";
import presence from "@convex-dev/presence/convex.config.js";
import prosemirrorSync from "@convex-dev/prosemirror-sync/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import crons from "@convex-dev/crons/convex.config.js";
import actionCache from "@convex-dev/action-cache/convex.config.js";
import migrations from "@convex-dev/migrations/convex.config.js";
import boat from "./components/boat/convex.config";

const app = defineApp({
  env: {
    // Optional so deployments without Boat still push; see components/boat.
    BOAT_API_KEY: v.optional(v.string()),
  },
});
app.use(presence);
app.use(prosemirrorSync);
app.use(workflow);
app.use(crons);
app.use(actionCache);
app.use(migrations);
app.use(boat, { env: { BOAT_API_KEY: app.env.BOAT_API_KEY } });

export default app;
