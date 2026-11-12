import {
  CHAT_UI_ELEMENT_PROPS,
  parseChatUiTree,
  type ChatUiElement,
  type ChatUiTone,
  type ChatUiTree,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { isHttpUrl } from "@eva/shared/safeUrl";
import { IconCheck, IconCircle, IconWorld } from "@tabler/icons-react-native";
import { CodeBlock } from "@vvedantb/native-ui/ai";
import { Badge, Button, MediaCard, Progress, Separator, Text, type BadgeVariant } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import * as WebBrowser from "expo-web-browser";
import { useState, type ReactNode } from "react";
import { Image, ScrollView, View } from "react-native";
import { copyText } from "@/ui/copyText";
import { useScheme, type Scheme } from "@/ui/theme";

/**
 * One agent-composed panel (`render_ui`) in the transcript, as the web
 * `ChatUiPanel`: the stored spec re-parsed (an unusable row draws nothing, as
 * the web), then drawn natively on the card fill. Every catalog component has
 * a phone part; an element the phone cannot draw (a type a newer catalog
 * added, or props that fail the catalog schema) becomes a card that opens the
 * chat on the web. A button replies in the chat or opens a link; with no
 * `onReply` (a closed chat, or one whose sandbox is asleep) the buttons are
 * disabled, as the web's disabled fieldset.
 */
export function ChatUiPanel({
  spec,
  onReply,
  onOpenWebChat,
}: {
  spec: string;
  onReply?: (message: string) => void;
  onOpenWebChat: () => void;
}) {
  const scheme = useScheme();
  const tree = parseChatUiTree(spec);
  if (!tree) return null;
  const context: RenderContext = { tree, scheme, onReply, onOpenWebChat, seen: new Set() };
  return (
    // Web `Surface density="tight"`: the card fill, the 16 radius, `p-3`.
    <View className="min-w-0 rounded-2xl p-3" style={{ backgroundColor: EVA_THEME[scheme].card }}>
      {renderElement(tree.root, context)}
    </View>
  );
}

type RenderContext = {
  tree: ChatUiTree;
  scheme: Scheme;
  onReply?: (message: string) => void;
  onOpenWebChat: () => void;
  /** Keys on the current path, so a cycle in a stored spec stops instead of recursing. */
  seen: Set<string>;
};

function renderChildren(element: ChatUiElement, context: RenderContext): ReactNode[] {
  return (element.children ?? []).map((key) => renderElement(key, context));
}

/** The web `GAP` lookup: `gap-2`, `gap-3`, `gap-4`. */
const GAP = { sm: 8, md: 12, lg: 16 } as const;
const ALIGN = { start: "flex-start", center: "center", stretch: "stretch" } as const;

function renderElement(key: string, context: RenderContext): ReactNode {
  const element = context.tree.elements[key];
  if (!element || context.seen.has(key)) return null;
  const inner: RenderContext = { ...context, seen: new Set(context.seen).add(key) };
  return <View key={key}>{drawElement(element, inner)}</View>;
}

/** One element by its catalog type, its props checked against the catalog schema first. */
function drawElement(element: ChatUiElement, context: RenderContext): ReactNode {
  const { scheme } = context;
  const theme = EVA_THEME[scheme];
  const fallback = <UnsupportedElement type={element.type} onOpenWebChat={context.onOpenWebChat} />;
  switch (element.type) {
    case "Stack": {
      const props = CHAT_UI_ELEMENT_PROPS.Stack.safeParse(element.props);
      if (!props.success) return fallback;
      const { direction, gap, align } = props.data;
      return (
        <View
          className="min-w-0"
          style={{
            flexDirection: direction === "vertical" ? "column" : "row",
            flexWrap: direction === "vertical" ? "nowrap" : "wrap",
            gap: GAP[gap],
            alignItems: ALIGN[align],
          }}
        >
          {renderChildren(element, context)}
        </View>
      );
    }
    case "Grid": {
      const props = CHAT_UI_ELEMENT_PROPS.Grid.safeParse(element.props);
      if (!props.success) return fallback;
      const columns = props.data.columns === 3 ? 3 : 2;
      const gap = GAP[props.data.gap];
      return <GridView columns={columns} gap={gap} cells={renderChildren(element, context)} />;
    }
    case "Panel": {
      const props = CHAT_UI_ELEMENT_PROPS.Panel.safeParse(element.props);
      if (!props.success) return fallback;
      return (
        <View className="min-w-0 gap-2 rounded-2xl p-3" style={{ backgroundColor: theme.muted }}>
          {props.data.title ? <Line size="text-sm" weight="semibold" color={theme.foreground} text={props.data.title} /> : null}
          {props.data.description ? <Line size="text-xs" color={theme.mutedForeground} text={props.data.description} /> : null}
          {renderChildren(element, context)}
        </View>
      );
    }
    case "Separator":
      return <Separator className="my-1" />;
    case "Heading": {
      const props = CHAT_UI_ELEMENT_PROPS.Heading.safeParse(element.props);
      if (!props.success) return fallback;
      return (
        <Line
          size={props.data.level === "h2" ? "text-base" : "text-sm"}
          weight="semibold"
          color={theme.foreground}
          text={props.data.text}
          role="header"
        />
      );
    }
    case "Text": {
      const props = CHAT_UI_ELEMENT_PROPS.Text.safeParse(element.props);
      if (!props.success) return fallback;
      const { variant, text } = props.data;
      return variant === "muted" ? (
        <Line size="text-xs" color={theme.mutedForeground} text={text} />
      ) : (
        <Line size="text-sm" weight={variant === "lead" ? "medium" : undefined} color={theme.foreground} text={text} />
      );
    }
    case "Metric": {
      const props = CHAT_UI_ELEMENT_PROPS.Metric.safeParse(element.props);
      if (!props.success) return fallback;
      const { label, value, delta, tone } = props.data;
      return (
        <View className="min-w-0 gap-0.5">
          <Line size="text-xs" color={theme.mutedForeground} text={label} />
          {/* Web `text-lg font-semibold tabular-nums leading-tight`. */}
          <Text
            className="font-instrument-sans-semibold"
            style={{ fontSize: 18, lineHeight: 22, fontWeight: "600", fontVariant: ["tabular-nums"], color: toneText(tone, scheme) }}
          >
            {value}
          </Text>
          {delta ? <Line size="text-2xs" color={theme.mutedForeground} text={delta} /> : null}
        </View>
      );
    }
    case "Badge": {
      const props = CHAT_UI_ELEMENT_PROPS.Badge.safeParse(element.props);
      if (!props.success) return fallback;
      return (
        <View className="self-start">
          <Badge variant={BADGE_VARIANT[props.data.tone]}>{props.data.text}</Badge>
        </View>
      );
    }
    case "Callout": {
      const props = CHAT_UI_ELEMENT_PROPS.Callout.safeParse(element.props);
      if (!props.success) return fallback;
      const { title, text, tone } = props.data;
      return (
        <View className="min-w-0 gap-1 rounded-2xl p-3" style={{ backgroundColor: toneSurface(tone, scheme) }}>
          {title ? <Line size="text-xs" weight="semibold" color={toneText(tone, scheme)} text={title} /> : null}
          <Line size="text-sm" color={theme.foreground} text={text} />
        </View>
      );
    }
    case "Progress": {
      const props = CHAT_UI_ELEMENT_PROPS.Progress.safeParse(element.props);
      if (!props.success) return fallback;
      const { label, value } = props.data;
      return (
        <View className="min-w-0 gap-1.5">
          <View className="flex-row items-center justify-between">
            <Line size="text-xs" color={theme.mutedForeground} text={label ?? "Progress"} />
            <Line size="text-xs" color={theme.mutedForeground} text={`${Math.round(value)}%`} />
          </View>
          <Progress value={value} accessibilityLabel={label ?? "Progress"} />
        </View>
      );
    }
    case "Checklist": {
      const props = CHAT_UI_ELEMENT_PROPS.Checklist.safeParse(element.props);
      if (!props.success) return fallback;
      return (
        <View className="min-w-0 gap-1.5">
          {props.data.items.map((item, index) => (
            <View key={index} className="flex-row items-start gap-2" accessibilityLabel={`${item.text}, ${item.done ? "done" : "not done"}`}>
              <View className="mt-[3px]">
                {item.done ? (
                  <IconCheck size={14} color={theme.success} />
                ) : (
                  <IconCircle size={14} color={withAlpha(theme.mutedForeground, 0.6)} />
                )}
              </View>
              <View className="min-w-0 flex-1">
                <Line size="text-sm" color={item.done ? theme.mutedForeground : theme.foreground} text={item.text} />
              </View>
            </View>
          ))}
        </View>
      );
    }
    case "Table": {
      const props = CHAT_UI_ELEMENT_PROPS.Table.safeParse(element.props);
      if (!props.success) return fallback;
      return <TableView columns={props.data.columns} rows={props.data.rows} scheme={scheme} />;
    }
    case "KeyValue": {
      const props = CHAT_UI_ELEMENT_PROPS.KeyValue.safeParse(element.props);
      if (!props.success) return fallback;
      return (
        <View className="min-w-0 gap-1.5">
          {props.data.items.map((item, index) => (
            <View key={index} className="flex-row items-baseline justify-between gap-3">
              <Line size="text-xs" color={theme.mutedForeground} text={item.label} />
              <View className="min-w-0 flex-1">
                <Text className="font-instrument-sans text-sm" style={{ fontSize: 14, lineHeight: 20, color: theme.foreground, textAlign: "right" }}>
                  {item.value}
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    }
    case "Code": {
      const props = CHAT_UI_ELEMENT_PROPS.Code.safeParse(element.props);
      if (!props.success) return fallback;
      return <CodeBlock code={props.data.code} language={props.data.language ?? undefined} onCopy={copyText} />;
    }
    case "Image": {
      const props = CHAT_UI_ELEMENT_PROPS.Image.safeParse(element.props);
      // Only a hosted http(s) image: a stored spec is data, so a `file:` or `content:` URI is not loaded.
      if (!props.success || !isHttpUrl(props.data.url)) return fallback;
      return <PanelImage url={props.data.url} alt={props.data.alt} />;
    }
    case "Button": {
      const props = CHAT_UI_ELEMENT_PROPS.Button.safeParse(element.props);
      if (!props.success) return fallback;
      const press = element.on?.["press"];
      const onPress = () => {
        if (!press) return;
        const message = press.params?.["message"];
        const url = press.params?.["url"];
        if (press.action === "reply" && typeof message === "string") context.onReply?.(message);
        // A stored spec is data: only an http(s) link opens.
        if (press.action === "open_url" && typeof url === "string" && isHttpUrl(url)) void WebBrowser.openBrowserAsync(url);
      };
      return (
        <View className="self-start">
          <Button size="sm" variant={BUTTON_VARIANT[props.data.variant]} fullWidth={false} disabled={context.onReply === undefined} onPress={onPress}>
            {props.data.label}
          </Button>
        </View>
      );
    }
    default:
      return fallback;
  }
}

/** A block the phone cannot draw: a card that opens this chat on the web, where it renders. */
function UnsupportedElement({ type, onOpenWebChat }: { type: string; onOpenWebChat: () => void }) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  return (
    <MediaCard
      icon={IconWorld}
      title="Open on the web to see this part"
      description={type}
      onPress={onOpenWebChat}
      backgroundColor={theme.muted}
      color={theme.foreground}
      mutedColor={theme.mutedForeground}
    />
  );
}

/** The web panel text sizes, with Eva's `text-2xs` (11 / 14) for a metric's delta. */
const LINE = {
  "text-2xs": { fontSize: 11, lineHeight: 14 },
  "text-xs": { fontSize: 12, lineHeight: 16 },
  "text-sm": { fontSize: 14, lineHeight: 20 },
  "text-base": { fontSize: 16, lineHeight: 24 },
} as const;

function Line({
  size,
  weight,
  color,
  text,
  role,
}: {
  size: keyof typeof LINE;
  weight?: "medium" | "semibold";
  color: string;
  text: string;
  role?: "header";
}) {
  return (
    <Text
      accessibilityRole={role}
      className={weight === "semibold" ? "font-instrument-sans-semibold" : weight === "medium" ? "font-instrument-sans-medium" : "font-instrument-sans"}
      style={[LINE[size], { color }, weight ? { fontWeight: weight === "semibold" ? "600" : "500" } : null]}
    >
      {text}
    </Text>
  );
}

/** Equal columns (the web `grid-cols-2` / `-3`), filled row by row. */
function GridView({ columns, gap, cells }: { columns: 2 | 3; gap: number; cells: ReactNode[] }) {
  const rows: ReactNode[][] = [];
  for (let index = 0; index < cells.length; index += columns) rows.push(cells.slice(index, index + columns));
  return (
    <View className="min-w-0" style={{ gap }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row" style={{ gap }}>
          {Array.from({ length: columns }, (_, column) => (
            <View key={column} className="min-w-0 flex-1">
              {row[column] ?? null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The web `Table`: a header row and rows under hairlines, scrolling sideways when it is wider than the column. */
function TableView({ columns, rows, scheme }: { columns: string[]; rows: string[][]; scheme: Scheme }) {
  const theme = EVA_THEME[scheme];
  const cell = (text: string, header: boolean, index: number) => (
    <View key={index} className="px-2 py-2" style={{ minWidth: 96, maxWidth: 240 }}>
      <Line size="text-sm" weight={header ? "medium" : undefined} color={header ? theme.mutedForeground : theme.foreground} text={text} />
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
      <View>
        <View className="flex-row" style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
          {columns.map((column, index) => cell(column, true, index))}
        </View>
        {rows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            className="flex-row"
            style={rowIndex < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: theme.border } : null}
          >
            {columns.map((_, index) => cell(row[index] ?? "", false, index))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** The web `max-h-80 w-full object-contain` image: full width at its own shape, at most 320 high. */
function PanelImage({ url, alt }: { url: string; alt: string | null }) {
  const [aspect, setAspect] = useState(4 / 3);
  const [width, setWidth] = useState(0);
  const height = width > 0 ? Math.min(320, width / aspect) : 0;
  return (
    <View className="w-full" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Image
        source={{ uri: url }}
        accessibilityLabel={alt ?? undefined}
        accessible={alt !== null}
        resizeMode="contain"
        style={{ width: "100%", height: height > 0 ? height : undefined, aspectRatio: height > 0 ? undefined : aspect, borderRadius: 16 }}
        onLoad={(event) => {
          const { width: w, height: h } = event.nativeEvent.source;
          if (w > 0 && h > 0) setAspect(w / h);
        }}
      />
    </View>
  );
}

/** The web `BADGE_VARIANT`: `neutral` stays quiet. */
const BADGE_VARIANT: Record<ChatUiTone, BadgeVariant> = {
  neutral: "secondary",
  positive: "success",
  warning: "warning",
  danger: "destructive",
};

/** The web `BUTTON_VARIANT`. */
const BUTTON_VARIANT = { primary: "default", secondary: "secondary", ghost: "ghost" } as const;

/** The web `TONE_TEXT`. */
function toneText(tone: ChatUiTone, scheme: Scheme): string {
  const theme = EVA_THEME[scheme];
  return { neutral: theme.foreground, positive: theme.success, warning: theme.warning, danger: theme.destructive }[tone];
}

/** The web `TONE_SURFACE`: tone-only fills at 10%. */
function toneSurface(tone: ChatUiTone, scheme: Scheme): string {
  const theme = EVA_THEME[scheme];
  return {
    neutral: theme.muted,
    positive: withAlpha(theme.success, 0.1),
    warning: withAlpha(theme.warning, 0.1),
    danger: withAlpha(theme.destructive, 0.1),
  }[tone];
}
