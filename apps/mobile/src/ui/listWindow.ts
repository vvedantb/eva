/**
 * Virtualised-list sizing for the phone's long, heavy lists (Inbox, Sessions).
 * React Native's defaults draw 10 rows, then add batches until the rows fill
 * 21 screens: for the Inbox's 100 rows (each about 70 components with swipe
 * gestures) that mounted every row and held the JS thread for seconds on a
 * mid-range phone. One screen of rows first, then a window of 3 screens above
 * and below the view, filled in batches of 8.
 */
export const LIST_WINDOW = {
  initialNumToRender: 12,
  windowSize: 7,
  maxToRenderPerBatch: 8,
};
