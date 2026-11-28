import { describe, expect, test } from "bun:test";
import { PACKAGE_HELPER_SCRIPT } from "../convex/_sandbox_runtime/packageManager";

describe("seed run GitHub release downloads survive direct-path failures", () => {
  test("the gh repo fallback registers a repo for each package manager", () => {
    const startAt = PACKAGE_HELPER_SCRIPT.indexOf("eva_pkg_install_gh() {");
    expect(startAt, "eva_pkg_install_gh moved or was renamed").toBeGreaterThan(
      -1,
    );
    const body = PACKAGE_HELPER_SCRIPT.slice(
      startAt,
      PACKAGE_HELPER_SCRIPT.indexOf("\n}", startAt),
    );
    expect(body, "apt path").toContain(
      "https://cli.github.com/packages stable main",
    );
    expect(body, "dnf path").toContain(
      "cli.github.com/packages/rpm/gh-cli.repo",
    );
    expect(body).toContain("dnf install -y gh --repo gh-cli");
  });
});
