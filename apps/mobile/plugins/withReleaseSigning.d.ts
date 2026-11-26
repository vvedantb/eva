import type { ExportedConfig } from "expo/config-plugins";

declare function withReleaseSigning(config: ExportedConfig): ExportedConfig;
export = withReleaseSigning;
