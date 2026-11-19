import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { copyFileIfPresent, isJsonObject } from "../utils.js";

export type SessionStoreConfig = {
  runtimeHomeDir: string;
  persistDir: string;
  localStateFile: string;
  persistStateFile: string;
  resumeField: "resumeThreadId" | "resumeSessionId";
  getActiveId: () => string;
  setActiveId: (id: string) => void;
};

export type PersistedSessionState = {
  resumeThreadId?: string;
  resumeSessionId?: string;
};

export function createSessionStore(config: SessionStoreConfig) {
  const readSessionState = (): PersistedSessionState | null => {
    const statePath = existsSync(config.localStateFile)
      ? config.localStateFile
      : existsSync(config.persistStateFile)
        ? config.persistStateFile
        : "";
    if (!statePath) {
      return null;
    }
    try {
      const parsed = JSON.parse(readFileSync(statePath, "utf8"));
      if (!isJsonObject(parsed)) {
        return null;
      }
      const value = parsed[config.resumeField];
      if (typeof value === "string" && value.trim()) {
        if (config.resumeField === "resumeThreadId") {
          return { resumeThreadId: value.trim() };
        }
        return { resumeSessionId: value.trim() };
      }
    } catch (error) {
      console.error(
        "Failed to read session state from " + statePath + ":",
        String(error),
      );
    }
    return null;
  };

  const writeSessionState = (): void => {
    const activeId = config.getActiveId();
    if (!activeId) {
      return;
    }
    mkdirSync(config.runtimeHomeDir, { recursive: true });
    const payload: Record<string, string> = {
      [config.resumeField]: activeId,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(config.localStateFile, JSON.stringify(payload, null, 2));
  };

  const hydratePersistedState = (label: string): void => {
    mkdirSync(config.runtimeHomeDir, { recursive: true });
    copyFileIfPresent(
      config.persistStateFile,
      config.localStateFile,
      label + "(state)",
    );
  };

  const syncStateToPersist = (label: string): void => {
    writeSessionState();
    mkdirSync(config.persistDir, { recursive: true });
    copyFileIfPresent(
      config.localStateFile,
      config.persistStateFile,
      label + "(state)",
    );
  };

  const resolveResumeId = (): string | null => {
    const persisted = readSessionState();
    if (!persisted) return null;
    if (config.resumeField === "resumeThreadId") {
      return persisted.resumeThreadId ?? null;
    }
    return persisted.resumeSessionId ?? null;
  };

  return {
    readSessionState,
    writeSessionState,
    hydratePersistedState,
    syncStateToPersist,
    resolveResumeId,
  };
}
