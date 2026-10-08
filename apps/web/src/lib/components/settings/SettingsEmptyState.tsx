interface SettingsEmptyStateProps {
  /** Tabler icon component, rendered muted above the copy. */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  /** One line on what to do about it. */
  description?: string;
  /** Primary call to action, e.g. the same button as the section header. */
  action?: React.ReactNode;
}

/**
 * The "nothing here yet" state for a settings section body.
 *
 * Sits inside a SettingsSection rather than floating on the canvas, so an empty
 * list still reads as part of the card it belongs to.
 */
export function SettingsEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: SettingsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <Icon size={28} className="mb-5 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
