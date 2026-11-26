/**
 * Sandbox sizes an app can pick (Settings → Repository → This app). Vercel
 * gives 2 GB of memory per vCPU and bills that memory for every running
 * minute, so the size is the main cost lever. The Pro plan caps a sandbox at
 * 8 vCPUs.
 */
export const SANDBOX_SIZES = {
  small: { vcpus: 2, memoryGb: 4 },
  medium: { vcpus: 4, memoryGb: 8 },
  large: { vcpus: 8, memoryGb: 16 },
} as const;

export type SandboxSize = keyof typeof SANDBOX_SIZES;

/** Size of an app that never picked one: what every sandbox had before the setting. */
export const DEFAULT_SANDBOX_SIZE: SandboxSize = "large";

const SIZE_NAMES: Record<SandboxSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/** Dropdown options, smallest first: "Medium (4 vCPU, 8 GB)". */
export const SANDBOX_SIZE_OPTIONS: ReadonlyArray<{
  value: SandboxSize;
  label: string;
}> = [
  sizeOption("small"),
  sizeOption("medium"),
  sizeOption("large"),
];

function sizeOption(value: SandboxSize): { value: SandboxSize; label: string } {
  const { vcpus, memoryGb } = SANDBOX_SIZES[value];
  return {
    value,
    label: `${SIZE_NAMES[value]} (${vcpus} vCPU, ${memoryGb} GB)`,
  };
}

/** vCPUs to request for an app's saved size (unset = the default size). */
export function sandboxVcpus(size: SandboxSize | undefined): number {
  return SANDBOX_SIZES[size ?? DEFAULT_SANDBOX_SIZE].vcpus;
}
