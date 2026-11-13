/**
 * Cache-bust query param for stale-deploy recovery. The shared helpers in
 * `@vvedantb/ui` default to `_vb_reload`; eva keeps `_eva_reload` so deployed
 * behaviour stays the same. Must match the inline listener in `index.html`.
 */
export const STALE_DEPLOY_RELOAD_PARAM = "_eva_reload";
