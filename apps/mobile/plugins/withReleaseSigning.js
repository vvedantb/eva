const { withReleaseSigning } = require("@vvedantb/config");

const MARKER = "// Added by apps/mobile/plugins/withReleaseSigning.js";

module.exports = function withEvaReleaseSigning(config) {
  return withReleaseSigning(config, { marker: MARKER });
};
