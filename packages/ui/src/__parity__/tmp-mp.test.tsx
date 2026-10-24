// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { ModelPickerContent as Next, modelPickerSurfaceClass } from "@vvedantb/ui";
import { ModelPickerContent } from "../__legacy__/ai-elements/model-picker";
import { MODEL_ACCOUNTS, MODEL_OPTIONS } from "../../../../apps/web/src/routes/dev/_components/ui-gallery/aiActivityFixtures";
import { evaUiConfig } from "../config";
import { renderPair } from "./harness";

test("gallery model picker", async () => {
  const props = { value: "claude-opus", accountId: null, options: MODEL_OPTIONS, accounts: MODEL_ACCOUNTS, onSelect: () => {} };
  const { legacy, next } = await renderPair(
    <div className={modelPickerSurfaceClass}><ModelPickerContent {...props} /></div>,
    <div className={modelPickerSurfaceClass}><Next {...props} /></div>,
    evaUiConfig,
  );
  expect(next).toBe(legacy);
});
