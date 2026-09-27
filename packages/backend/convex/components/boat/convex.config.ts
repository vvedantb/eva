import { defineComponent } from "convex/server";
import { v } from "convex/values";

/**
 * Boat (boat.dev) sandboxes, vendored from `@boatdev/convex` 0.1.0 (MIT, see
 * LICENSE). Upstream requires BOAT_API_KEY, which fails the push on every
 * deployment without it (fresh sandbox backends push before their env seed);
 * here it is optional and Boat calls fail with a clear error until it is set.
 */
export default defineComponent("boat", {
  env: {
    BOAT_API_KEY: v.optional(v.string()),
  },
});
