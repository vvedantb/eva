import { describe, expect, it } from "vitest";
import { statusDetail, type ConnectorStatus } from "./connectorStatus";

const base: ConnectorStatus = {
  provider: "linear",
  label: "Linear",
  oauthConfigured: true,
  source: "none",
  workspaceName: null,
  accountLabel: null,
  actor: null,
  shared: false,
  envKey: null,
  envTeamName: null,
};

describe("statusDetail", () => {
  it("describes an OAuth connection", () => {
    expect(
      statusDetail({
        ...base,
        source: "oauth",
        accountLabel: "vedant@evalucom.com",
        workspaceName: "Evalucom",
      }),
    ).toBe("Signed in as vedant@evalucom.com · Evalucom");
  });

  it("describes a team env-key fallback", () => {
    expect(
      statusDetail({
        ...base,
        source: "env",
        envKey: "LINEAR_API_KEY",
        envTeamName: "Evalucom",
      }),
    ).toBe("Using Evalucom LINEAR_API_KEY");
  });

  it("describes a missing connection", () => {
    expect(statusDetail(base)).toBe("Not connected");
  });
});
