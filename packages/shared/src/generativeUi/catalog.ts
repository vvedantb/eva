/**
 * The catalog of components and actions the agent can build a chat panel from.
 *
 * This is the guardrail for Eva's generative UI: Jev composes a tree out of
 * these types and nothing else, so a panel can never render arbitrary markup
 * or call anything the chat has not wired up. The backend uses it to validate
 * what the composer produced; the web app registers a React component for each
 * entry (see `apps/web/src/lib/components/chat/generativeUi`).
 *
 * The prop schemas are deliberately closed sets of strings — every value is
 * supplied by the agent as a content block, never invented by the model.
 */

import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { CHAT_UI_ELEMENT_PROPS } from "./elements";

export {
  CHAT_UI_BUTTON_VARIANTS,
  CHAT_UI_TEXT_STYLES,
  CHAT_UI_TONES,
  type ChatUiTone,
} from "./elements";

export const chatUiCatalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: CHAT_UI_ELEMENT_PROPS.Stack,
      slots: ["default"],
      description: "Layout row or column that holds other elements.",
    },
    Grid: {
      props: CHAT_UI_ELEMENT_PROPS.Grid,
      slots: ["default"],
      description: "Equal-width columns, e.g. a row of metrics.",
    },
    Panel: {
      props: CHAT_UI_ELEMENT_PROPS.Panel,
      slots: ["default"],
      description: "Bordered container grouping related content.",
    },
    Heading: {
      props: CHAT_UI_ELEMENT_PROPS.Heading,
      description: "Section title.",
    },
    Text: {
      props: CHAT_UI_ELEMENT_PROPS.Text,
      description: "A paragraph of read-only prose.",
    },
    Metric: {
      props: CHAT_UI_ELEMENT_PROPS.Metric,
      description: "One labelled number or short value.",
    },
    Badge: {
      props: CHAT_UI_ELEMENT_PROPS.Badge,
      description: "Small status pill.",
    },
    Callout: {
      props: CHAT_UI_ELEMENT_PROPS.Callout,
      description: "Highlighted note, warning or result.",
    },
    Progress: {
      props: CHAT_UI_ELEMENT_PROPS.Progress,
      description: "Completion bar from 0 to 100.",
    },
    Checklist: {
      props: CHAT_UI_ELEMENT_PROPS.Checklist,
      description: "List of done / not-done items.",
    },
    Table: {
      props: CHAT_UI_ELEMENT_PROPS.Table,
      description: "Small table of rows and columns.",
    },
    KeyValue: {
      props: CHAT_UI_ELEMENT_PROPS.KeyValue,
      description: "Label / value pairs, e.g. a summary of settings.",
    },
    Code: {
      props: CHAT_UI_ELEMENT_PROPS.Code,
      description: "Preformatted code or command output.",
    },
    Image: {
      props: CHAT_UI_ELEMENT_PROPS.Image,
      description: "A screenshot or diagram already hosted at a URL.",
    },
    Button: {
      props: CHAT_UI_ELEMENT_PROPS.Button,
      events: ["press"],
      description: "Clickable button that replies in the chat or opens a link.",
    },
    Separator: {
      props: CHAT_UI_ELEMENT_PROPS.Separator,
      description: "Horizontal rule between sections.",
    },
  },
  actions: {
    reply: {
      params: z.object({ message: z.string() }),
      description: "Send the given text back to the agent as a chat message.",
    },
    open_url: {
      params: z.object({ url: z.string() }),
      description: "Open a link in a new tab.",
    },
  },
});
