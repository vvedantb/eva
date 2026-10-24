// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { Label as NextLabel } from "@vvedantb/ui";
import { Label } from "../ui/label";
import { renderPair } from "./harness";

test("harness renders both trees and normalises class order", async () => {
  const { legacy, next } = await renderPair(<Label>Name</Label>, <NextLabel>Name</NextLabel>, {});
  expect(legacy).toContain("<label");
  expect(next).toContain("<label");
});
