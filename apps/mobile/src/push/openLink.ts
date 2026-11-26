import { parseAppHref } from "@eva/shared/appHref";
import { router } from "expo-router";
import { Linking } from "react-native";
import { WEB_URL } from "@/config";

/**
 * Opens what a notification points at, on the phone when it can: its reply
 * thread (`threadRootId` in `chatTarget`), its chat (`chatTarget`), a pull request at once, a task, project, session or doc
 * through `/open` (which looks the item up by its number), and anything else
 * (drafts, automations, settings) on the web, as before.
 */
export function openAppLink(link: { chatTarget?: string; threadRootId?: string; href?: string; repoId?: string }) {
  if (link.chatTarget && link.threadRootId) {
    router.push({ pathname: "/chat/[target]/thread/[rootId]", params: { target: link.chatTarget, rootId: link.threadRootId } });
    return;
  }
  if (link.chatTarget) {
    router.push({ pathname: "/chat/[target]", params: { target: link.chatTarget } });
    return;
  }
  if (!link.href) return;
  const target = parseAppHref(link.href);
  if (target && link.repoId) {
    if (target.kind === "review") {
      router.push({ pathname: "/review/[repoId]/[prNumber]", params: { repoId: link.repoId, prNumber: String(target.prNumber) } });
    } else {
      router.push({ pathname: "/open", params: { href: link.href, repo: link.repoId } });
    }
    return;
  }
  void Linking.openURL(`${WEB_URL}${link.href}`);
}
