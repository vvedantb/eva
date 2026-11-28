import { Children, cloneElement, createContext, isValidElement, useContext, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { useLook } from './looks'
import { Roll } from './motion/Roll'
import './messages.css'

const Ready = createContext<{ current: boolean }>({ current: true })

function threadTops(root: HTMLElement) {
  const style = getComputedStyle(root)
  const extra = style.boxSizing === 'border-box' ? 0 :
    [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth].reduce((sum, value) => sum + (parseFloat(value) || 0), 0)
  const width = parseFloat(style.width) + extra
  const scale = (width && root.getBoundingClientRect().width / width) || 1
  const parents = new Map<Element, number>()
  return new Map(Array.from(root.children, (el) => {
    const parent = (el as HTMLElement).offsetParent
    if (parent && !parents.has(parent)) parents.set(parent, parent.getBoundingClientRect().top)
    return [el, (el.getBoundingClientRect().top - (parent ? parents.get(parent)! : 0)) / scale]
  }))
}

export interface ThreadProps {
  app?: 'imessage' | 'sms' | 'chat'
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/**
 * A column of messages pinned to its bottom, as a conversation is. Messages
 * already on screen glide up when one arrives instead of jumping; the thread
 * clips what scrolls off its top, so put it under a header or let the stage
 * crop it. Tails go on the last bubble of each run automatically.
 */
export function Thread({ app = 'imessage', className, style, children }: ThreadProps) {
  const ref = useRef<HTMLDivElement>(null)
  const ready = useRef(false)
  const tops = ref.current ? threadTops(ref.current) : new Map<Element, number>()
  useEffect(() => {
    ready.current = true
  }, [])
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const next = threadTops(root)
    for (const [node, top] of Array.from(next)) {
      const el = node as HTMLElement
      const was = tops.get(el)
      if (was === undefined || Math.abs(was - top) < 0.001) continue
      const now = parseFloat(getComputedStyle(el).top) || 0
      el.style.transition = 'none'
      el.style.top = `${was + now - top}px`
      void el.offsetWidth
      el.style.transition = ''
      el.style.top = ''
    }
  })
  const list = Children.toArray(children).filter(isValidElement) as ReactElement<BubbleProps>[]
  const fromOf = (c: ReactElement<BubbleProps>) => (c.type === Bubble ? c.props.from : null)
  const out = list.map((c, i) => {
    if (c.type !== Bubble || c.props.tail !== undefined) return c
    const next = list.slice(i + 1).find((n) => n.type === Bubble)
    return cloneElement(c, { tail: !next || fromOf(next) !== c.props.from })
  })
  return (
    <Ready.Provider value={ready}>
      <div ref={ref} className={`ss-thread${className ? ` ${className}` : ''}`} data-app={app} style={style}>
        {out}
      </div>
    </Ready.Provider>
  )
}

export interface BubbleProps {
  from: 'me' | 'them'
  typing?: boolean
  tail?: boolean
  source?: string
  tapback?: { emoji: ReactNode; show?: boolean }
  avatar?: ReactNode
  className?: string
  style?: CSSProperties
  children?: ReactNode
  [data: `data-${string}`]: unknown
}

/**
 * One message. Bubbles in the thread on its first render are the opening
 * picture and don't animate; only later arrivals rise in. In minimal
 * fidelity a string message becomes a bar.
 */
export function Bubble({ avatar, from, typing = false, tail, source, tapback, className, style, children, ...data }: BubbleProps) {
  const { fidelity } = useLook()
  const arrived = useRef(useContext(Ready).current).current
  const ref = useRef<HTMLDivElement>(null)
  const size = useRef<{ w: number; h: number } | null>(null)
  const wasTyping = useRef(typing)
  const grew = useRef(false)
  if (wasTyping.current && !typing) grew.current = true
  wasTyping.current = typing
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const was = size.current
    el.style.width = ''
    el.style.height = ''
    const measured = getComputedStyle(el)
    const now = { w: parseFloat(measured.width), h: parseFloat(measured.height) }
    size.current = now
    if (!was || (was.w === now.w && was.h === now.h)) return
    const text = el.querySelector<HTMLElement>('.ss-bubble__text')
    if (text) text.style.width = getComputedStyle(text).width
    el.style.transition = 'none'
    el.style.width = `${was.w}px`
    el.style.height = `${was.h}px`
    void el.offsetWidth
    el.style.transition = ''
    el.style.width = `${now.w}px`
    el.style.height = `${now.h}px`
    const end = () => {
      el.style.width = ''
      el.style.height = ''
      if (text) text.style.width = ''
    }
    el.addEventListener('transitionend', end, { once: true })
    return () => el.removeEventListener('transitionend', end)
  }, [typing, children])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !arrived || !source) return
    const stage = el.closest('.ss-stage') ?? document
    const src = stage.querySelector<HTMLElement>(`[data-target="${source}"]`) ?? stage.querySelector<HTMLElement>(source)
    const text = el.querySelector<HTMLElement>('.ss-bubble__text')
    if (!src || !text) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || el.closest('[data-still]')) return
    el.style.transition = 'none'
    el.style.left = el.style.top = '0px'
    const k = el.getBoundingClientRect().width / el.offsetWidth || 1
    const o = src.getBoundingClientRect()
    const t = text.getBoundingClientRect()
    const dx = (o.left - t.left) / k
    const dy = (o.top + o.height / 2 - (t.top + t.height / 2)) / k
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'
    el.style.transition = 'none'
    el.style.left = `${dx}px`
    el.style.top = `${dy}px`
    el.setAttribute('data-flying', '')
    el.style.color = getComputedStyle(src).color
    void el.offsetWidth
    el.style.transition = `left 0.5s ${ease}, top 0.5s ${ease}, color 0.3s ease 0.06s`
    el.style.left = el.style.top = ''
    el.removeAttribute('data-flying')
    el.style.color = ''
    const end = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== 'top') return
      el.style.transition = ''
      el.removeEventListener('transitionend', end)
    }
    el.addEventListener('transitionend', end)
    return () => el.removeEventListener('transitionend', end)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  let body = children
  if (fidelity === 'minimal' && typeof children === 'string') body = <span className="ss-bar ss-bubble__bar" style={{ width: Math.min(180, children.length * 5.5) }} />
  return (
    <div className={`ss-bubble-row${className ? ` ${className}` : ''}`} data-from={from} data-avatar={avatar ? '' : undefined} style={style}>
      {avatar && from !== 'me' && <span className="ss-bubble__avatar" aria-hidden>{avatar}</span>}
      <div {...data} ref={ref} className="ss-bubble" data-arrived={arrived || undefined} data-source={source ? '' : undefined} data-tail={tail || undefined} data-typing={typing || undefined} data-grew={grew.current || undefined} data-tapback={tapback && tapback.show !== false ? '' : undefined}>
        {tapback && (
          <span className="ss-tapback" data-show={tapback.show !== false || undefined} aria-hidden>
            <span className="ss-tapback__emoji">{tapback.emoji}</span>
          </span>
        )}
        {typing ? (
          <span className="ss-bubble__dots" aria-label="typing">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="ss-bubble__text">{body}</span>
        )}
        <svg className="ss-bubble__tail" viewBox="0 0 18 16" aria-hidden>
          <path d={from === 'me' ? 'M0 0H12V8.5C12 12.6 14 15 17.5 16C15 16.7 12.2 16.5 9.8 15.3L0 15Z' : 'M18 0H6V8.5C6 12.6 4 15 0.5 16C3 16.7 5.8 16.5 8.2 15.3L18 15Z'} />
        </svg>
      </div>
    </div>
  )
}

/** A centered timestamp between runs ("Today 9:41"). */
export function Stamp({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ss-stamp${className ? ` ${className}` : ''}`}>{children}</div>
}

/**
 * The small status under your last message. `children` rolls when it changes
 * (Delivered to Read); `show` false folds it away.
 */
export function Receipt({ show = true, children, className }: { show?: boolean; children: string; className?: string }) {
  return (
    <div className={`ss-receipt${className ? ` ${className}` : ''}`} data-show={show || undefined}>
      <span>
        <Roll variant="fade">{children}</Roll>
      </span>
    </div>
  )
}
