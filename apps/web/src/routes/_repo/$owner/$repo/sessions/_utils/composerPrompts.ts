/** Seeded when the user picks one of the design preview's variations. */
export function designVariationPrompt(letter: string, label: string): string {
  return `Implement variation ${letter} ("${label}") from the design preview.`;
}
