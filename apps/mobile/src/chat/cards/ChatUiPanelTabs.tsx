import { Tabs, TabsContent, TabsList, TabsTrigger } from "@vvedantb/native-ui/primitives";
import type { ReactNode } from "react";
import { View } from "react-native";

/**
 * The web `ChatUiPanelTabs`: a turn that composed a panel says the same thing
 * twice, so the panel takes the slot ("UI", shown first) and the prose moves
 * one tap away ("Text"). Only the chosen one is drawn.
 */
export function ChatUiPanelTabs({ panel, text }: { panel: ReactNode; text: ReactNode }) {
  return (
    <Tabs defaultValue="ui" className="gap-2">
      <TabsList size="sm" accessibilityLabel="Reply format">
        <TabsTrigger value="ui">UI</TabsTrigger>
        <TabsTrigger value="text">Text</TabsTrigger>
      </TabsList>
      <TabsContent value="ui">
        <View className="min-w-0">{panel}</View>
      </TabsContent>
      <TabsContent value="text">{text}</TabsContent>
    </Tabs>
  );
}
