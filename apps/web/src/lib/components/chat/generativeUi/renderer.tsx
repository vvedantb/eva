import { createRenderer } from "@json-render/react";
import { chatUiCatalog } from "@eva/shared/generativeUi";
import {
  GridElement,
  PanelElement,
  SeparatorElement,
  StackElement,
} from "@/lib/components/chat/generativeUi/layoutComponents";
import {
  BadgeElement,
  ButtonElement,
  CalloutElement,
  ChecklistElement,
  CodeElement,
  HeadingElement,
  ImageElement,
  KeyValueElement,
  MetricElement,
  ProgressElement,
  TableElement,
  TextElement,
} from "@/lib/components/chat/generativeUi/contentComponents";

/**
 * The one renderer for agent-composed chat panels. Every component in the
 * catalog must appear here — a spec can only name types the catalog defines,
 * and this map is what turns those names into Eva's own UI.
 */
export const ChatUiSpecRenderer = createRenderer(chatUiCatalog, {
  Stack: StackElement,
  Grid: GridElement,
  Panel: PanelElement,
  Separator: SeparatorElement,
  Heading: HeadingElement,
  Text: TextElement,
  Metric: MetricElement,
  Badge: BadgeElement,
  Callout: CalloutElement,
  Progress: ProgressElement,
  Checklist: ChecklistElement,
  Table: TableElement,
  KeyValue: KeyValueElement,
  Code: CodeElement,
  Image: ImageElement,
  Button: ButtonElement,
});
