import { createContext, useContext } from 'react'

// Static stages settle motion parts too.
export const StillContext = createContext(false)

/**
 * Whether the enclosing stage is static. A stage shows its still; parts skip
 * their tweens. Eva does not gate on `prefers-reduced-motion` (see the note
 * in globals.css), so the vendored OS-preference check is removed.
 */
export function useStill() {
  return useContext(StillContext)
}
