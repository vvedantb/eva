import { useAuth } from "@clerk/clerk-expo";
import {
  IconChecklist,
  IconInbox,
  IconSettings,
  IconTerminal2,
} from "@tabler/icons-react-native";
import { GlassBlurProvider } from "@vvedantb/native-ui/floating";
import {
  FloatingTabBar,
  type FloatingTabBarProps,
} from "@vvedantb/native-ui/tab-bar";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import type { ColorValue } from "react-native";
import { EnsureUser } from "@/auth/EnsureUser";
import { usePush } from "@/push/push";

type TabIconProps = { color: ColorValue; size: number };

/** Tabler icons take a colour string; the tab bar passes plain strings. */
const iconColor = (color: ColorValue) =>
  typeof color === "string" ? color : undefined;

const renderTabBar = (props: FloatingTabBarProps) => (
  <FloatingTabBar {...props} />
);
// Same icons as the web rail: inbox arrow, terminal for Sessions, checklist for Quick tasks, gear.
const inboxIcon = ({ color, size }: TabIconProps) => (
  <IconInbox color={iconColor(color)} size={size} />
);
const sessionsIcon = ({ color, size }: TabIconProps) => (
  <IconTerminal2 color={iconColor(color)} size={size} />
);
const quickTasksIcon = ({ color, size }: TabIconProps) => (
  <IconChecklist color={iconColor(color)} size={size} />
);
const settingsIcon = ({ color, size }: TabIconProps) => (
  <IconSettings color={iconColor(color)} size={size} />
);

/** Mounted only when signed in, so push registers for the right user. */
function SignedInEffects() {
  usePush();
  return null;
}

/** The floating pill tab bar from @vvedantb/native-ui over Expo Router tabs (as vmem). */
export default function TabsLayout() {
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  return (
    <EnsureUser>
      <GlassBlurProvider>
        <SignedInEffects />
        <Tabs screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
          <Tabs.Screen
            name="index"
            options={{ title: "Inbox", tabBarIcon: inboxIcon }}
          />
          <Tabs.Screen
            name="sessions"
            options={{ title: "Sessions", tabBarIcon: sessionsIcon }}
          />
          <Tabs.Screen
            name="quick-tasks"
            options={{ title: "Quick tasks", tabBarIcon: quickTasksIcon }}
          />
          <Tabs.Screen
            name="settings"
            options={{ title: "Settings", tabBarIcon: settingsIcon }}
          />
        </Tabs>
      </GlassBlurProvider>
    </EnsureUser>
  );
}
