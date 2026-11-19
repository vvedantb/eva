/**
 * Eva's mark: a filled circle with a two-tone star across its middle.
 *
 * Single source of truth for the geometry, shared by the web (`EvaIcon`,
 * `LogoMark`, the favicon data URI) and the mobile app. The two static files
 * in apps/web/public (`icon.svg`, `favicon.svg`) mirror these numbers by hand —
 * edit them alongside anything here.
 */
export const EVA_MARK_TOP_POINTS = "0,256 217,237 256,64 295,237 512,256";
export const EVA_MARK_BOTTOM_POINTS = "0,256 217,275 256,449 295,275 512,256";
/**
 * Thicker-waisted star for the disc marks (favicon, Manager Ave). They enlarge
 * the star 1.45x into a small circle, where the logo's thin waist shrinks to a
 * hairline cross at 16 px. Same tips, wider inner points.
 */
export const EVA_DISC_STAR_TOP_POINTS = "0,256 204,222 256,64 308,222 512,256";
export const EVA_DISC_STAR_BOTTOM_POINTS =
  "0,256 204,290 256,449 308,290 512,256";
/** Star enlargement inside a disc mark; the overflow is clipped to the disc. */
export const EVA_DISC_STAR_SCALE = 1.45;
export const EVA_MARK_PURPLE = "#8B3FB8";
export const EVA_MARK_BLUE = "#3B7DD8";

