/** Returns the persisted sandbox id for reuse. */
export function preferPersistedSandboxId(args: {
  sandboxId: string | undefined;
}): string | undefined {
  return args.sandboxId;
}
