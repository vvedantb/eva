/// <reference types="nativewind/types" />

// `app/_layout.tsx` imports `../global.css` for its side effect (NativeWind's styles).
// tsc-rs checks side-effect imports, so the module needs a declaration.
declare module "*.css";
