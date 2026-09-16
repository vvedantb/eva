import { IconFileText } from "@tabler/icons-react";

/** Centered icon + message, matching the sandbox panels' inactive states. */
export function ViewerNotice({ message }: { message: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 px-6 text-center">
      <IconFileText className="w-12 h-12 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
