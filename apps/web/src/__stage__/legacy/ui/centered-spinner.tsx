import { cn } from "../utils/cn";
import { Spinner } from "./spinner";

/**
 * The one loading state for a pane, list or page: the Eva spinner, centred in
 * whatever box it is given.
 *
 * It replaced ~30 bespoke skeletons. Each of those had to be re-shaped every
 * time its content changed, and they drifted anyway; a spinner says "wait"
 * just as well and costs nothing to keep true.
 */
export function CenteredSpinner({
  label,
  className,
  ...props
}: React.ComponentProps<"div"> & { label: string }) {
  return (
    <div
      aria-busy="true"
      className={cn(
        "flex min-h-0 w-full flex-1 items-center justify-center p-6",
        className,
      )}
      {...props}
    >
      <Spinner aria-label={label} />
    </div>
  );
}
