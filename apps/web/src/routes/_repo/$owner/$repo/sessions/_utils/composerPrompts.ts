/**
 * Prompts that read-only surfaces (the design preview) hand to the
 * chat composer. Modes are gone, so "use this" now means "seed the
 * next message" rather than flipping the session into another mode.
 */

/** Seeded when the user picks one of the design preview's variations. */
export function designVariationPrompt(letter: string, label: string): string {
  return `Implement variation ${letter} ("${label}") from the design preview.`;
}
