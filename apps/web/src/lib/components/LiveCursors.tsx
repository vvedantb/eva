"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useLocation } from "@tanstack/react-router";
import { Cursor, CursorPointer, CursorBody, CursorName } from "@vvedantb/ui";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useLiveCursors, type RemoteCursor } from "@/lib/hooks/useLiveCursors";
import { ACCENT_COLORS } from "@/lib/contexts/themeTokens";

const CURSOR_ROOM_PREFIX = "cursor:";

type AccentColorKey = keyof typeof ACCENT_COLORS;

function isAccentColorKey(value: string): value is AccentColorKey {
  return value in ACCENT_COLORS;
}

function accentToHex(accentColor: string): string {
  if (isAccentColorKey(accentColor)) {
    return ACCENT_COLORS[accentColor].preview;
  }
  return ACCENT_COLORS.zinc.preview;
}

function RemoteCursorItem({ cursor }: { cursor: RemoteCursor }) {
  const hex = accentToHex(cursor.accentColor);
  return (
    <div
      className="absolute"
      style={{
        left: `${cursor.x}%`,
        top: `${cursor.y}%`,
      }}
    >
      <Cursor style={{ color: hex }}>
        <CursorPointer />
        <CursorBody className="text-white" style={{ backgroundColor: hex }}>
          <CursorName data-pii>{cursor.firstName}</CursorName>
        </CursorBody>
      </Cursor>
    </div>
  );
}

export function LiveCursors() {
  const userId = useQuery(api.auth.me);
  const { pathname } = useLocation();

  if (!userId) return null;

  return <LiveCursorsInner userId={userId} pathname={pathname} />;
}

function LiveCursorsInner({
  userId,
  pathname,
}: {
  userId: Id<"users">;
  pathname: string;
}) {
  const roomId = `${CURSOR_ROOM_PREFIX}${pathname}`;
  const cursors = useLiveCursors(roomId, userId);

  if (cursors.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-60">
      {cursors.map((cursor) => (
        <RemoteCursorItem key={cursor.userId} cursor={cursor} />
      ))}
    </div>
  );
}
