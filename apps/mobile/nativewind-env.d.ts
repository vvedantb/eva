/// <reference types="nativewind/types" />

// `app/_layout.tsx` imports `../global.css` for its side effect (NativeWind's styles).
// bun check (TypeScript 7) checks side-effect imports, so the module needs a declaration.
declare module "*.css";
