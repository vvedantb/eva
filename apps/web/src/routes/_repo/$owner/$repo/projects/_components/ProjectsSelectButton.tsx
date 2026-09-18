import { m, AnimatePresence } from "motion/react";
import {
  Button,
  motionFast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";
import { IconCheckbox } from "@tabler/icons-react";

interface ProjectsSelectButtonProps {
  /** Hidden in the timeline view and once the selection bar has taken over. */
  visible: boolean;
  onClick: () => void;
}

/** The projects board's entry point into selection mode — the same affordance
 *  the quick-tasks toolbar uses, so the two surfaces stay learnable together. */
export function ProjectsSelectButton({
  visible,
  onClick,
}: ProjectsSelectButtonProps) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {visible ? (
        <m.div
          key="projects-select-action"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={motionFast}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                className="motion-press hover:scale-[1.01] active:scale-[0.96]"
                onClick={onClick}
              >
                <IconCheckbox size={16} aria-hidden />
                {/* `sr-only`, not `hidden`: the tooltip below is hover-only,
                    so on touch this span is the button's only name. */}
                <span className="max-sm:sr-only">Select</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="sm:hidden">Select</TooltipContent>
          </Tooltip>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
