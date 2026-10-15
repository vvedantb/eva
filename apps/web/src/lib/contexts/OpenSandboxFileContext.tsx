"use client";

import { createContext, useContext, type ReactNode } from "react";

type OpenSandboxFile = (path: string) => void;

const OpenSandboxFileContext = createContext<OpenSandboxFile | null>(null);

export function OpenSandboxFileProvider({
  children,
  onOpenFile,
}: {
  children: ReactNode;
  onOpenFile?: OpenSandboxFile;
}) {
  return (
    <OpenSandboxFileContext value={onOpenFile ?? null}>
      {children}
    </OpenSandboxFileContext>
  );
}

export function useOpenSandboxFile(): OpenSandboxFile | undefined {
  return useContext(OpenSandboxFileContext) ?? undefined;
}
