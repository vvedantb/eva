/** Opens the full-page artifact viewer in a new browser tab. */
export function openArtifactInNewTab(artifactId: string) {
  window.open(`/artifacts/${artifactId}`, "_blank", "noopener");
}
