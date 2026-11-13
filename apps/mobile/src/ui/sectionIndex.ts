/**
 * The page for a `?section=` param, else the first. Keep this lookup out of a
 * screen's body: inline, a `findIndex` on a pill list that is sometimes the
 * module constant and sometimes a filtered copy made the React Compiler bail
 * on the whole screen ("MethodCall::property must be an unpromoted +
 * unmemoized MemberExpression"), so every change redrew the tab in full.
 */
export function sectionIndex(sections: ReadonlyArray<{ id: string }>, param: string | undefined): number {
  return Math.max(0, sections.findIndex((option) => option.id === param));
}
