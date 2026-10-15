/** Returns a required Convex env var, throwing when it is missing or empty. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in the Convex environment`);
  return value;
}
