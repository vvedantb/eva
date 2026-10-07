import { UserInitials } from "@eva/shared/user-initials";
import { Avatar, AvatarFallback } from "@eva/ui";
import type { Id } from "@eva/backend";

export function UserMessageAvatar({
  userId,
  size = "sm",
  className = "h-4 w-4",
}: {
  userId?: Id<"users">;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  if (userId) {
    return <UserInitials userId={userId} hideLastSeen size={size} />;
  }
  return (
    <Avatar className={className}>
      <AvatarFallback className="bg-secondary text-[10px] text-muted-foreground">
        U
      </AvatarFallback>
    </Avatar>
  );
}
