import { describe, expect, test } from "bun:test";
import { dependencyInstallCommand } from "../convex/_sandbox_runtime/git";

describe("dependency install commands", () => {
  test("yarn bootstraps the shim first", () => {
    const command = dependencyInstallCommand("yarn", "/w");
    expect(command.startsWith("npm install -g yarn &&")).toBe(true);
    expect(command).toContain("yarn install");
  });

  test("pnpm may purge node_modules without a TTY prompt", () => {
    const command = dependencyInstallCommand("pnpm", "/w");
    expect(command.startsWith("npm install -g pnpm &&")).toBe(true);
    expect(command).toContain(
      "pnpm install --config.confirm-modules-purge=false",
    );
  });

  test("npm installs in place", () => {
    expect(dependencyInstallCommand("npm", "/w")).toBe("cd /w && npm install");
  });
});
