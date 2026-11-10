import { SettingsField, SettingsSection } from "@vvedantb/ui";
import { SetUpWithEvaButton } from "@/lib/components/evaConfig/SetUpWithEvaButton";
import {
  EvaConfigManagedNote,
  ReadOnlyLines,
  type EvaConfig,
} from "@/lib/components/evaConfig/EvaConfigReadOnly";

interface AppCommandsReadOnlyProps {
  /** Undefined until the repo has a synced `.eva/config.json`. */
  evaConfig: EvaConfig | undefined;
  devPort: number | undefined;
  devCommand: string | undefined;
  startupCommands: string[] | undefined;
  backgroundCommands: string[] | undefined;
  stopCommands: string[] | undefined;
}

/**
 * The App page's command sections: the values synced from `.eva/config.json`,
 * with no inputs. Commands only change through the file.
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
      <SettingsSection
        title="Dev server"
        action={evaConfig ? undefined : <SetUpWithEvaButton />}
      >
        <div className="grid gap-5">
          {evaConfig ? (
            <EvaConfigManagedNote evaConfig={evaConfig} />
          ) : (
            <p className="text-xs text-muted-foreground">
              This repo has no <code>.eva/config.json</code> yet. Set up with
              Eva to write it.
            </p>
          )}
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
