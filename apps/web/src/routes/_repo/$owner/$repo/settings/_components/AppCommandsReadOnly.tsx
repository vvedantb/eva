import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsField } from "@/lib/components/settings/SettingsField";
import {
  EvaConfigManagedNote,
  ReadOnlyLines,
  type EvaConfig,
} from "@/lib/components/evaConfig/EvaConfigReadOnly";

interface AppCommandsReadOnlyProps {
  evaConfig: EvaConfig;
  devPort: number | undefined;
  devCommand: string | undefined;
  startupCommands: string[] | undefined;
  backgroundCommands: string[] | undefined;
  stopCommands: string[] | undefined;
}

/**
 * The App page's command sections when the repo owns them in
 * `.eva/config.json`: the synced values, with no inputs.
 */
export function AppCommandsReadOnly({
  evaConfig,
  devPort,
  devCommand,
  startupCommands,
  backgroundCommands,
  stopCommands,
}: AppCommandsReadOnlyProps) {
  return (
    <>
      <SettingsSection title="Dev server">
        <div className="grid gap-5">
          <EvaConfigManagedNote evaConfig={evaConfig} />
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingsField label="Port">
              <ReadOnlyLines
                lines={devPort !== undefined ? [String(devPort)] : undefined}
                emptyLabel="Auto-detect"
              />
            </SettingsField>
            <SettingsField label="Command">
              <ReadOnlyLines
                lines={devCommand ? [devCommand] : undefined}
                emptyLabel="Auto-detect"
              />
            </SettingsField>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Sandbox lifecycle"
        description="Commands for boot, daemons, and seeded snapshots, read from .eva/config.json."
      >
        <div className="grid gap-5">
          <SettingsField label="Startup">
            <ReadOnlyLines lines={startupCommands} />
          </SettingsField>
          <SettingsField label="Background">
            <ReadOnlyLines lines={backgroundCommands} />
          </SettingsField>
          <SettingsField label="Stop">
            <ReadOnlyLines lines={stopCommands} />
          </SettingsField>
        </div>
      </SettingsSection>
    </>
  );
}
