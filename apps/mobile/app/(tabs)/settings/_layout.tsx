import { Stack } from "expo-router";
import { useStackScreenOptions } from "@/ui/stackOptions";

export default function SettingsLayout() {
  return <Stack screenOptions={useStackScreenOptions()} />;
}
