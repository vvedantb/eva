import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from '../reduced-motion'
import './Roll.css'

/**
 * Text that rolls when it changes. Only the part that differs moves: in
 * "$0.01 per 1,000" to "$0.0098 per 1,000", "$0.0" and " per 1,000" hold still
 * while the old digits slide up and out and the new ones rise in one by one.
 * Words move whole: "Checking calendars" to "Everyone can make it" rolls word
 * by word, and a change never splits a word.
 * The changing part eases to its new width, so the text after it moves with it.
 * For prices, counts in words, statuses and labels.
 */
export function Roll({ delay = 0, children, ...rest }: Parameters<typeof RollNow>[0] & {
  delay?: number
}) {
  const reduced = useReducedMotion()
  const [held, setHeld] = useState(children)
  useEffect(() => {
    if (!delay || reduced) return setHeld(children)
    const id = setTimeout(() => setHeld(children), delay)
    return () => clearTimeout(id)
  }, [children, delay, reduced])
  return <RollNow {...rest}>{delay && !reduced ? held : children}</RollNow>
}

function RollNow({
  children,
  stagger = 45,
  variant = 'roll',
  align,
  className,
  style,
}: {
  children: string
  stagger?: number
  align?: 'start' | 'end'
  variant?: 'roll' | 'fade'
  className?: string
  style?: CSSProperties
}) {
  const reduced = useReducedMotion()
  const [view, setView] = useState({ text: children, head: 0, tail: 0, old: '', key: 0, numeric: true })
  const mid = useRef<HTMLSpanElement>(null)
  const root = useRef<HTMLSpanElement>(null)
  const fromWidth = useRef<number | null>(null)
  const rootWidth = () => {
    if (!root.current || !mid.current) return 0
    const height = parseFloat(getComputedStyle(mid.current).height)
    const scale = height > 0 ? mid.current.getBoundingClientRect().height / height : 1
    return root.current.getBoundingClientRect().width / (scale || 1)
  }
  const [side, setSide] = useState<'start' | 'end'>(align ?? 'start')
  useLayoutEffect(() => {
    if (align) return setSide(align)
    const el = root.current
    if (!el?.parentElement) return
    let box: HTMLElement = el
    while (box.parentElement && box.parentElement.childElementCount === 1 && Math.abs(box.parentElement.getBoundingClientRect().width - box.getBoundingClientRect().width) < 1) box = box.parentElement
    const parent = box.parentElement
    if (!parent) return
    const p = getComputedStyle(parent)
    const flex = /flex/.test(p.display) && p.flexDirection.startsWith('row')
    const pushed = () => {
      const prev = box.previousElementSibling
      const r = box.getBoundingClientRect()
      const pr = parent.getBoundingClientRect()
      const flush = Math.abs(pr.right - parseFloat(p.paddingRight) - parseFloat(p.borderRightWidth) - r.right) < 1
      const slack = prev ? r.left - prev.getBoundingClientRect().right - (parseFloat(p.columnGap) || 0) : 0
      return flush && slack > 1
    }
    const end =
      /right|end/.test(getComputedStyle(el).textAlign) ||
      (flex && box === parent.lastElementChild && (/space-between|flex-end|^end/.test(p.justifyContent) || pushed()))
    setSide(end ? 'end' : 'start')
  }, [align])
  useEffect(() => {
    if (reduced) {
      setView({ text: children, head: 0, tail: 0, old: '', key: 0, numeric: true })
      return
    }
    if (view.text === children) return
    const a = view.text
    const b = children
    let head = 0
    while (head < a.length && head < b.length && a[head] === b[head]) head++
    let tail = 0
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
    const numeric = /^[\d.,$€£%+\-−\s]*$/.test(a.slice(head, a.length - tail) + b.slice(head, b.length - tail))
    if (!numeric) {
      const space = (c: string | undefined) => c === undefined || /\s/.test(c)
      while (head > 0 && !space(b[head - 1]) && !space(b[head])) head--
      while (tail > 0 && !space(b[b.length - tail - 1]) && !space(b[b.length - tail])) tail--
    }
    const key = view.key + 1
    fromWidth.current = rootWidth()
    setView({ text: b, head, tail, old: a.slice(head, a.length - tail), key, numeric })
    const id = setTimeout(() => setView((v) => (v.key === key ? { ...v, old: '' } : v)), 700)
    return () => clearTimeout(id)
  }, [children, reduced]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = mid.current
    const live = el?.querySelector<HTMLElement>('[data-live]')
    const out = el?.querySelector<HTMLElement>('[data-out]')
    if (!el || !live) return
    const width = (node: HTMLElement) => parseFloat(getComputedStyle(node).width) || 0
    const next = width(live)
    if (reduced || view.key === 0) {
      el.style.transition = 'none'
      el.style.width = `${next}px`
      fromWidth.current = null
      return
    }
    const affixes = rootWidth() - width(el)
    const previous = fromWidth.current
    fromWidth.current = null
    const start = previous === null ? (out ? width(out) : 0) : Math.max(0, previous - affixes)
    el.style.transition = 'none'
    el.style.width = `${start}px`
    void el.offsetWidth
    el.style.transition = ''
    if (variant === 'fade') {
      el.style.width = `${next}px`
      return
    }
    const widest = Math.max(next, start, out ? width(out) : 0)
    el.style.width = `${widest}px`
    if (widest === next) return
    const id = setTimeout(() => (el.style.width = `${next}px`), 360)
    return () => clearTimeout(id)
  }, [view.key, reduced, reduced ? children : undefined])
  const { text, head, tail, old, key, numeric } = reduced
    ? { text: children, head: 0, tail: 0, old: '', key: 0, numeric: true }
    : view
  const now = text.slice(head, text.length - tail)
  const units = numeric ? now.split('') : now.split(/(?<=\s)/)
  return (
    <span ref={root} className={`ss-roll${className ? ` ${className}` : ''}`} data-variant={variant} data-align={side} style={style}>
      {text.slice(0, head)}
      <span ref={mid} className="ss-roll__mid">
        {old && (
          <span key={`o${key}`} className="ss-roll__item" data-out>
            {old}
          </span>
        )}
        <span key={`n${key}`} className="ss-roll__item" data-live>
          {key > 0 && variant === 'fade'
            ? <span className="ss-roll__char">{now}</span>
            : key > 0
            ? units.map((c, i) => (
                <span key={i} className="ss-roll__char" style={{ animationDelay: `${110 + i * stagger}ms` }}>
                  {c}
                </span>
              ))
            : now}
        </span>
      </span>
      {text.slice(text.length - tail)}
    </span>
  )
}
