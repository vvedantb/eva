import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconChevronLeft, IconChevronRight, type IconProps } from "@tabler/icons-react-native";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetRow, SheetTitle } from "@vvedantb/native-ui/primitives";
import type { ComponentType, ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * A web dropdown or context menu as one bottom sheet, so every menu sheet has
 * the same title and 56-high `SheetRow`s with no gap between them. With
 * submenus, the root page lists the items, and an item with a submenu swaps
 * the sheet to that page, whose header has a 44 back button to the root.
 * `onBack` is set on a submenu page.
 */
export function MenuSheet({
  open,
  onOpenChange,
  title,
  onBack,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-3 px-3">
        <SheetHeader className="min-h-11 flex-row items-center gap-1 px-2">
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onBack}
              className="-ml-2 h-11 w-11 items-center justify-center rounded-lg active:opacity-70"
            >
              <IconChevronLeft size={20} color={muted} />
            </Pressable>
          ) : null}
          <SheetTitle numberOfLines={1} className="min-w-0 flex-1">
            {title}
          </SheetTitle>
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** A root-page item that opens a submenu: its icon, its label and a chevron. */
export function SubmenuRow({
  icon,
  title,
  disabled,
  onPress,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <View className="flex-row items-center">
      <View className="min-w-0 flex-1">
        <SheetRow icon={icon} title={title} disabled={disabled} onPress={onPress} />
      </View>
      <View className="absolute right-4" style={{ pointerEvents: "none", opacity: disabled ? 0.5 : 1 }}>
        <IconChevronRight size={16} color={muted} />
      </View>
    </View>
  );
}

/** The web `DropdownMenuSeparator` between groups of items. */
export function MenuDivider() {
  const theme = EVA_THEME[useScheme()];
  return <View className="mx-4 my-1 h-px" style={{ backgroundColor: theme.border }} />;
}
