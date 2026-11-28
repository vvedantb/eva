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
