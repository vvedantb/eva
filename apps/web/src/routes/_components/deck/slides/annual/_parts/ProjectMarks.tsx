/** Redline's own mark, from its landing page favicon. */
export function RedlineMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 14 14" fill="none" width={size} height={size} aria-hidden>
      <rect
        x="1"
        y="1"
        width="12"
        height="12"
        rx="2"
        stroke="#e11d48"
        strokeWidth="2"
      />
      <rect x="4.5" y="4.5" width="5" height="5" rx="1" fill="#e11d48" />
    </svg>
  );
}

/** flowtape's own mark: the filled circle from its wordmark. */
export function FlowtapeMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#fcfcfc" />
    </svg>
  );
}

/** vmem's three petals, from `VmemPaths.tsx` in the openwork repo. */
export function VmemMark({ size }: { size: number }) {
  return (
    <svg
      viewBox="-20 -6 250 212"
      width={size}
      height={size}
      fill="currentColor"
      className="text-white"
      aria-hidden
    >
      <path d="M81.3835 181.779C22.2397 161.586 13.4909 102.411 36.5078 61.7585L25.0687 36.241C-10.1246 81.7999 -19.3022 165.229 71.8802 203.249L81.3835 181.779Z" />
      <path d="M128.109 181.779C187.253 161.586 196.002 102.411 172.985 61.7585L184.424 36.241C219.617 81.7999 228.795 165.229 137.612 203.249L128.109 181.779Z" />
      <path d="M156.866 14.2622C115.857 -4.51398 93.2253 -4.72022 53.5056 13.461L63.1205 36.2163C92.2894 19.6073 110.744 19.1365 147.571 34.774L156.866 14.2622Z" />
    </svg>
  );
}

/** CarePulse's heart-and-pulse mark, cropped from its own logo SVG. */
export function CarePulseMark({ size }: { size: number }) {
  return (
    <img
      src="/brands/carepulse.svg"
      alt=""
      width={size}
      height={Math.round((size * 56) / 106)}
      aria-hidden
    />
  );
}
