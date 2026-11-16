import { api, type Doc } from "@eva/backend";
import {
  htmlRenderFrameHeight,
  htmlRenderHostContextMessage,
  injectHtmlRenderBootstrap,
  type HtmlRenderHostContext,
} from "@eva/shared/htmlRender";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { Text } from "@vvedantb/native-ui/primitives";
import { HtmlView } from "@vvedantb/native-ui/webview";
import { useQuery } from "convex/react";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { View } from "react-native";
import { textColor, useScheme, type Scheme } from "@/ui/theme";
import { useRowSeen } from "./seenRows";

/**
 * Eva's theme tokens for an agent page's `:root`, from the phone theme. The
 * web reads the same names off its live CSS; the phone has no chart ramp,
 * radius or font tokens to hand over, so a page falls back to its own there.
 */
function hostContext(scheme: Scheme): HtmlRenderHostContext {
  const theme = EVA_THEME[scheme];
  return {
    theme: scheme === "light" ? "light" : "dark",
    styles: {
      variables: {
        "--background": theme.background,
        "--foreground": theme.foreground,
        "--card": theme.card,
        "--card-foreground": theme.foreground,
        "--popover": theme.popover,
        "--popover-foreground": theme.popoverForeground,
        "--muted": theme.muted,
        "--muted-foreground": theme.mutedForeground,
        "--secondary": theme.secondary,
        "--secondary-foreground": theme.secondaryForeground,
        "--primary": theme.primary,
        "--primary-foreground": theme.primaryForeground,
        "--accent": theme.accent,
        "--accent-foreground": theme.accentForeground,
        "--border": theme.border,
        "--ring": theme.ring,
        "--destructive": theme.destructive,
        "--destructive-foreground": theme.destructiveForeground,
        "--success": theme.success,
        "--warning": theme.warning,
      },
    },
  };
}

/**
 * One agent-authored HTML page (`render_html`) in the transcript, as the web
 * `ChatHtmlFrame`: the page in a sandboxed WebView (scripts on, links to the
 * in-app browser), its box at the agent's height until the page reports its
 * own (80 to 2000). The page loads once its row is first on screen; until
 * then the box holds the agent's height so nothing below it moves.
 */
export function ChatHtmlFrame({ render, rowKey }: { render: Doc<"chatHtmlRenders">; rowKey: string }) {
  const seen = useRowSeen(rowKey);
  const html = useQuery(api.chatHtml.getHtml, seen ? { renderId: render._id } : "skip");
  const scheme = useScheme();
  if (html === null) {
    return (
      <Text className="font-instrument-sans text-xs" style={textColor(scheme, "muted")}>
        {`Unable to load ${render.title}`}
      </Text>
    );
  }
  if (html === undefined) return <View style={{ height: htmlRenderFrameHeight(render.height, null) }} />;
  return <HtmlPage html={html} title={render.title} height={render.height} />;
}

function HtmlPage({ html, title, height }: { html: string; title: string; height: number }) {
  const scheme = useScheme();
  // Built once, with the theme of the moment for a correct first paint. A new
  // document would reload the page and drop its state, so later theme changes
  // go in as a host message instead, as the web.
  const [document] = useState(() => injectHtmlRenderBootstrap(html, hostContext(scheme)));
  // The page reports its own height; until then the agent's height holds.
  const [reportedHeight, setReportedHeight] = useState<number | null>(null);
  return (
    <HtmlView
      html={document}
      title={title}
      height={htmlRenderFrameHeight(height, reportedHeight)}
      hostMessage={JSON.stringify(htmlRenderHostContextMessage(hostContext(scheme)))}
      onContentHeight={setReportedHeight}
      onOpenLink={(url) => void WebBrowser.openBrowserAsync(url)}
    />
  );
}
