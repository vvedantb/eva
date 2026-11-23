"use client";

import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import {
  filterSessionsStartedBy,
  sortSessionsForSidebar,
  standupEntryHeading,
} from "@eva/shared";
import { Button, Surface } from "@vvedantb/ui";
import { IconHistory, IconSunrise } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { sessionHrefForRow } from "@/lib/components/sidebar/_utils/repoSessionPaths";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

type ActionCard = {
  key: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  action: string;
  href: string;
};

/**
 * Suggested next steps under the landing composer: Today while the Daily
 * standup is on, and the user's most recent session. Today reuses the
 * sidebar's `standupStatus` query, so the card and the sidebar dot agree on
 * unread; it stays after the standup is read and only its copy changes.
 */
export function ComposerActionCards() {
  const { repo, repoId, basePath } = useRepo();
  const status = useQuery(api.today.standupStatus, { repoId });
  const sessions = useQuery(api.sessions.list, { repoId });
  const me = useQuery(api.auth.me);

  const cards: ActionCard[] = [];
  if (status?.enabled === true) {
    cards.push({
      key: "today",
      icon: IconSunrise,
      title:
        status.unreadAt === null
          ? "Today"
          : `New standup · ${standupEntryHeading(status.unreadAt)}`,
      action: status.unreadAt === null ? "View Today" : "Open Today",
      href: toInternalRepoHref(`${basePath}/today`),
    });
  }
  const [lastSession] = sortSessionsForSidebar(
    (filterSessionsStartedBy(sessions, me) ?? []).filter(
      (session) => entityPathSegment(session) !== null,
    ),
    "updated_at",
  );
  if (lastSession) {
    cards.push({
      key: "last-session",
      icon: IconHistory,
      title: lastSession.title,
      action: "Continue",
      href: sessionHrefForRow(repo, lastSession),
    });
  }
  if (cards.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {cards.map((card) => (
        <Surface
          key={card.key}
          density="tight"
          className="flex min-w-0 items-center gap-3 sm:flex-1 sm:basis-0"
        >
          <card.icon size={18} className="shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {card.title}
          </p>
          <Button asChild size="sm" variant="secondary" className="shrink-0">
            <Link to={card.href}>{card.action}</Link>
          </Button>
        </Surface>
      ))}
    </div>
  );
}
