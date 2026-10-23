/**
 * vmem's mark, copied from the vmem repo (`apps/desktop/renderer/VmemLogo.tsx`).
 * `currentColor` fills it, so the caller sets the colour.
 */
export function VmemMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 210 204"
      role="img"
      aria-label="vmem"
    >
      <path
        d="M81.3835 181.779C22.2397 161.586 13.4909 102.411 36.5078 61.7585L25.0687 36.241C-10.1246 81.7999 -19.3022 165.229 71.8802 203.249L81.3835 181.779Z"
        fill="currentColor"
      />
      <path
        d="M128.109 181.779C187.253 161.586 196.002 102.411 172.985 61.7585L184.424 36.241C219.617 81.7999 228.795 165.229 137.612 203.249L128.109 181.779Z"
        fill="currentColor"
      />
      <path
        d="M156.866 14.2622C115.857 -4.51398 93.2253 -4.72022 53.5056 13.461L63.1205 36.2163C92.2894 19.6073 110.744 19.1365 147.571 34.774L156.866 14.2622Z"
        fill="currentColor"
      />
    </svg>
  );
}
