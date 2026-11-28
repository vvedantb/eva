import { createContext, useContext, useEffect, useState } from 'react'

export const StillContext = createContext(false)

/** Whether the viewer asked for reduced motion. A stage shows its still; parts skip their tweens. */
export function useReducedMotion() {
  const still = useContext(StillContext)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return still || reduced
}
