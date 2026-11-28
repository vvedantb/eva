const originals = new Map<string, string | undefined>();

export function stubEnv(name: string, value: string | undefined): void {
  if (!originals.has(name)) originals.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

export function unstubAllEnvs(): void {
  for (const [name, value] of originals) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originals.clear();
}
