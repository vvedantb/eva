import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import './Collapse.css'

/**
 * Opens and closes its content's height, so what comes after moves with it:
 * a row leaving a list, a log panel opening under a status. Closing dims the
 * content fast and dissolves it over the whole of the height's travel, so a
 * row is faint by the time the edge reaches it and the space is never seen
 * empty; opening brings the content with its height. Children can have any height or
 * padding. The inner box is a deliberate crop (film.mjs skips it) and clips
 * 3px wide, so rings and shadows on the content aren't shaved.
 */
export function Collapse({ open, reveal = 'clip', from = 'above', solid = false, children, className, ...rest }: HTMLAttributes<HTMLDivElement> & {
  open: boolean
  reveal?: 'clip' | 'drop'
  from?: 'above' | 'below'
  solid?: boolean
  children: ReactNode
}) {
  const [moving, setMoving] = useState(false)
  const [tall, setTall] = useState(false)
  const inner = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useLayoutEffect(() => {
    const h = inner.current?.scrollHeight ?? 0
    if (h) setTall(h > 44)
    if (first.current) return void (first.current = false)
    setMoving(true)
    const t = setTimeout(() => setMoving(false), 900)
    return () => clearTimeout(t)
  }, [open])
  return (
    <div
      {...rest}
      className={`ss-collapse${className ? ` ${className}` : ''}`}
      data-open={open || undefined}
      data-reveal={reveal}
      data-solid={solid || undefined}
      data-from={reveal === 'drop' ? from : undefined}
      data-moving={moving || undefined}
      data-tall={tall || undefined}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows') setMoving(false)
        rest.onTransitionEnd?.(e)
      }}
    >
      <div ref={inner} className="ss-collapse__inner" data-crop={reveal === 'clip' || undefined}>
        {children}
      </div>
    </div>
  )
}
