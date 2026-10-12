/**
 * Content served by the `get_skill` MCP tool for `eva-grab-proof`. The user's
 * own prompt, kept word for word; the session prompt already carries the
 * screenshot folder and shared-browser rules.
 */
export function buildEvaGrabProofContent(): string {
  return `# eva-grab-proof

can you just grab screenshot of this as proof if you can, can seed with mock data if needed (clean this up after)
`;
}
