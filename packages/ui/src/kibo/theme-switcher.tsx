"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../utils/cn";
import { motionSpring } from "../utils/motion";

const themes = [
  {
    key: "system",
    icon: IconDeviceDesktop,
    label: "System theme",
  },
  {
    key: "light",
    icon: IconSun,
    label: "Light theme",
  },
  {
    key: "dark",
    icon: IconMoon,
    label: "Dark theme",
  },
] as const;

type ThemeKey = "light" | "dark" | "system";

export type ThemeSwitcherProps = {
  value?: ThemeKey;
  onChange?: (theme: ThemeKey) => void;
  defaultValue?: ThemeKey;
  className?: string;
};

export const ThemeSwitcher = ({
  value,
  onChange,
  defaultValue = "system",
  className,
}: ThemeSwitcherProps) => {
  const [theme, setTheme] = useControllableState({
    defaultProp: defaultValue,
    prop: value,
    onChange,
  });
  const [mounted, setMounted] = useState(false);

  const handleThemeClick = useCallback(
    (themeKey: ThemeKey) => {
      setTheme(themeKey);
    },
    [setTheme],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative isolate flex h-8 rounded-full bg-background p-1 ring-1 ring-border",
        className,
      )}
    >
      {themes.map(({ key, icon: Icon, label }) => {
        const isActive = theme === key;

        return (
          <button
            aria-label={label}
            className="relative h-6 w-6 rounded-full motion-press active:scale-[0.94] hit-target"
            key={key}
            onClick={() => handleThemeClick(key)}
            type="button"
          >
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-full bg-secondary"
                layoutId="activeTheme"
                transition={motionSpring}
              />
            )}
            <Icon
              className={cn(
                "relative z-10 m-auto h-4 w-4",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            />
          </button>
        );
      })}
    </div>
  );
};
