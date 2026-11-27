/** Served by the `tablerIconData()` vite plugin — see apps/web/vite/tablerIconData.ts. */
declare module "virtual:tabler-icon-data" {
  type TablerIconNodes = [
    tag: string,
    attrs: Record<string, string | number>,
  ][];
  const data: Record<
    string,
    ["outline" | "filled", TablerIconNodes] | undefined
  >;
  export default data;
}
