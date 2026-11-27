const { withReleaseSigning } = require("@vvedantb/config");

const MARKER = "// Added by apps/mobile/plugins/withReleaseSigning.js";

/** @param {import("expo/config").ExpoConfig} config */
module.exports = function withEvaReleaseSigning(config) {
  return withReleaseSigning(config, { marker: MARKER });
};
