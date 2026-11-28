"use no memo"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import './stage.css'
import { checkSeam, createAct, Stopped, type Script } from './act'
import { Cursor, ripple as spawnRipple, type CursorKind, type CursorStyle } from './cursor'
import { Keycaps, type Keys, type KeysAt } from './keys'
import { LookContext, type Fidelity, type Layout, type Palette, type Theme } from './looks'
import { EMPTY, nameOf, rectOf, sameRects, stageSpace, targetRectOf, thumb, type Point, type Rect, type Target } from './measure'
import { StillContext, useStill } from './reduced-motion'
import { clock } from './clock'
import { clamp, easeInOutCubic, isDev, warn } from './util'

/** loop: repeats while on screen. once: plays when first seen, then holds the end. hover: plays while the pointer is over it, settles back when it leaves; on a screen with no hover (a phone) it plays once. */
export type Play = 'loop' | 'once' | 'hover'

/** Design tokens for a look: `--ss-accent`, `--ss-radius-md`, `--ss-font` and the rest. */
export type LookTokens = { [token: `--ss-${string}`]: string }

export interface StageProps<S> {
  width: number
  height: number
  initial?: S
  script?: Script<S>
  poster?: S
  cursor?: { at: Target | { wide: Target; compact: Target }; kind?: CursorKind; style?: CursorStyle; still?: boolean; ripple?: boolean; idle?: number | false }
  play?: Play
  compact?: { below: number; width: number; height: number }
  keys?: KeysAt | { wide: KeysAt; compact: KeysAt }
  hover?: string[]
  theme?: Theme
  palette?: Palette
  fidelity?: Fidelity
  greys?: 'warm' | 'cool'
  tokens?: LookTokens
  fill?: boolean
  accent?: string
  ground?: 'orbs' | [string, string] | [string, string, string]
  speed?: number
  className?: string
  specimen?: boolean
  unframed?: boolean
  children: (s: S, rect: (name: string) => Rect, layout: Layout) => ReactNode
}

const NONE = {}

export function Stage<S extends object>({
  width,
  height,
  initial = NONE as S,
  script,
  poster,
  cursor,
  hover,
  play: playProp = 'loop',
  compact,
  keys: keysAt = 'bottom',
  palette = 'accent',
  greys,
  fidelity = 'standard',
  specimen,
  unframed,
  speed: speedProp = 1,
  accent,
  tokens,
  ground,
  fill: fillProp = false,
  theme: themeProp = 'light',
  className,
  children,
}: StageProps<S>) {
  const play: Play = playProp === 'hover' && typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches ? 'once' : playProp
  const [layout, setLayout] = useState<Layout>('wide')
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const restAt = (): Target => {
    const at = cursor!.at
    return typeof at === 'object' && 'wide' in at ? at[layoutRef.current] : at
  }
  const [grows, setGrows] = useState(false)
  const designW = layout === 'compact' && compact ? compact.width : width
  const designH = layout === 'compact' && compact ? compact.height : height

  const fitRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const reduced = useStill()
  const still = !script || reduced

  const [state, setState] = useState<S>(() => (still && poster ? poster : initial))
  const stateRef = useRef(state)
  stateRef.current = state
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  scaleRef.current = scale
  const film = typeof window === 'undefined' ? {} : ((window as unknown as { __stageshow?: { slow?: number; theme?: Theme } }).__stageshow ?? {})
  const speed = speedProp / (film.slow ?? 1)
  const theme = film.theme ?? themeProp
  const [kind, setKind] = useState<CursorKind>(cursor?.kind ?? 'pointer')
  const ripple = (at: Point) => {
    const root = rootRef.current
    if (!root || reduced) return
    spawnRipple(root, at)
  }
  const kindRef = useRef(kind)
  kindRef.current = kind
  const [keys, setKeys] = useState<Keys>({ id: 0, caps: [], show: false, down: false })
  const [lastKeys, setLastKeys] = useState<Keys | null>(null)
  const keysRef = useRef(keys)
  keysRef.current = keys
  const pos = useRef<Point>({ x: 0, y: 0 })
  const autoRef = useRef<((p: Point) => void) | null>(null)
  const [inset, setInset] = useState(0)
  const autoUsed = useRef(false)
  const dragging = useRef(false)
  const hovered = useRef<Element | null>(null)

  useLayoutEffect(() => {
    const fit = fitRef.current
    if (!fit) return
    const measure = () => {
      const w = fit.clientWidth
      const wide = !!fit.parentElement?.closest('[data-ss-wide]')
      const next: Layout = compact && !wide && w < compact.below ? 'compact' : 'wide'
      setLayout(next)
      const grow = fillProp || !!fit.parentElement?.closest('[data-ss-fill]')
      setGrows(grow)
      const dw = next === 'compact' ? compact!.width : width
      const s = Math.min(grow ? 2 : 1, w / dw)
      setScale(s)
      setInset(Math.max(0, (w - dw * s) / 2))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(fit)
    const hosts = new MutationObserver(measure)
    for (let host = fit.parentElement; host; host = host.parentElement) {
      hosts.observe(host, { attributes: true, attributeFilter: ['data-ss-wide', 'data-ss-fill'] })
    }
    return () => {
      ro.disconnect()
      hosts.disconnect()
    }
  }, [width, compact?.below, compact?.width, fillProp]) // eslint-disable-line react-hooks/exhaustive-deps

  const [rects, setRects] = useState<Record<string, Rect>>({})
  const measureAll = useCallback(() => {
    const root = rootRef.current
    if (!root) return {}
    const out: Record<string, Rect> = {}
    const targets = root.querySelectorAll<HTMLElement>('[data-target]')
    if (!targets.length) return out
    const space = stageSpace(root, scaleRef.current)
    targets.forEach((el) => {
      out[el.dataset.target!] = targetRectOf(root, el, scaleRef.current, space)
    })
    return out
  }, [])
  const passes = useRef({ n: 0, frame: 0, owed: false })
  const remeasure = useCallback(() => {
    const p = passes.current
    if (!p.frame)
      p.frame = clock.layoutRaf(() => {
        p.n = 0
        p.frame = 0
        if (!p.owed) return
        p.owed = false
        const next = measureAll()
        setRects((prev) => (sameRects(prev, next) ? prev : next))
      })
    if (p.n >= 4) {
      p.owed = true
      return
    }
    p.n++
    const next = measureAll()
    setRects((prev) => (sameRects(prev, next) ? prev : next))
  }, [measureAll])
  useLayoutEffect(remeasure)
  useLayoutEffect(() => () => {
    clock.cancelLayoutRaf(passes.current.frame)
    passes.current = { n: 0, frame: 0, owed: false }
  }, [])
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.addEventListener('transitionend', remeasure)
    root.addEventListener('animationend', remeasure)
    return () => {
      root.removeEventListener('transitionend', remeasure)
      root.removeEventListener('animationend', remeasure)
    }
  }, [remeasure])
  const rectFor = useCallback((name: string) => rects[name] ?? EMPTY, [rects])

  const [settling, setSettling] = useState(true)
  useLayoutEffect(() => {
    setSettling(true)
    let live = true
    let frame = 0
    const release = () => {
      frame = clock.layoutRaf(() => {
        frame = clock.layoutRaf(() => live && setSettling(false))
      })
    }
    if (!document.fonts || document.fonts.status === 'loaded') release()
    else document.fonts.ready.then(() => live && release())
    return () => {
      live = false
      clock.cancelLayoutRaf(frame)
    }
  }, [layout])

  const active = useRef(0)
  const loopAt = useRef(0)
  const moved = useRef(false)
  const firstMove = useRef<number | null>(null)
  const place = useCallback((p: Point) => {
    if (loopAt.current && !moved.current && Math.hypot(p.x - pos.current.x, p.y - pos.current.y) > 0.5) {
      moved.current = true
      if (firstMove.current === null) firstMove.current = performance.now() - loopAt.current
    }
    pos.current = p
    active.current = performance.now()
    const el = cursorRef.current
    if (!el) return
    el.style.transform = `translate(${p.x}px, ${p.y}px)`
    el.removeAttribute('data-idle')
  }, [])

  const resolve = useCallback((t: Target): Point => {
    if (typeof t === 'object' && t !== null && 'wide' in t) t = (layoutRef.current === 'compact' ? t.compact : t.wide)
    const name = nameOf(t)
    if (name === null) return t as Point
    const root = rootRef.current
    const el = root?.querySelector<HTMLElement>(`[data-target="${name}"]`)
    if (!root || !el) {
      warn(`no element with data-target="${name}"`)
      return pos.current
    }
    const r = rectOf(root, el, scaleRef.current)
    const f = typeof t === 'string' ? { x: 0.5, y: 0.5 } : (t as { x: number; y: number })
    return { x: r.x + r.width * f.x, y: r.y + r.height * f.y }
  }, [])

  useLayoutEffect(() => {
    if (!still || !hover) return
    const root = rootRef.current
    hover.forEach((name) => root?.querySelector(`[data-target="${name}"]`)?.setAttribute('data-hover', ''))
  })

  useLayoutEffect(() => {
    if (cursor && !loopAt.current) place(resolve(restAt()))
  }, [scale, layout]) // eslint-disable-line react-hooks/exhaustive-deps

  const glideId = useRef(0)
  const resetFrame = useRef(0)
  const cancelReset = useCallback(() => {
    ++glideId.current
    cancelAnimationFrame(resetFrame.current)
    resetFrame.current = 0
    rootRef.current?.removeAttribute('data-settling')
  }, [])
  const reset = useCallback((glide = false) => {
    cancelReset()
    const id = glideId.current
    dragging.current = false
    setState(initial)
    setKind(cursor?.kind ?? 'pointer')
    setKeys((k) => ({ ...k, show: false, down: false }))
    setLastKeys(null)
    rootRef.current?.querySelectorAll('[data-hover],[data-pressed]').forEach((el) => {
      el.removeAttribute('data-hover')
      el.removeAttribute('data-pressed')
    })
    rootRef.current?.removeAttribute('data-mark')
    rootRef.current?.querySelectorAll<HTMLElement>('[data-scrolled]').forEach((el) => {
      el.scrollTop = 0
      el.removeAttribute('data-scrolled')
      thumb(el)
    })
    rootRef.current?.querySelectorAll('[data-scrolling]').forEach((el) => el.removeAttribute('data-scrolling'))
    cursorRef.current?.removeAttribute('data-pressed')
    hovered.current = null
    if (!cursor) return
    if (!glide) {
      resetFrame.current = requestAnimationFrame(() => {
        resetFrame.current = 0
        place(resolve(restAt()))
        autoRef.current?.(pos.current)
      })
      return
    }
    const root = rootRef.current
    root?.setAttribute('data-settling', '')
    resetFrame.current = requestAnimationFrame(() => {
      const from = { ...pos.current }
      const end = resolve(restAt())
      const ms = clamp(320 + Math.hypot(end.x - from.x, end.y - from.y) * 0.7, 380, 700)
      const t0 = performance.now()
      const step = () => {
        if (glideId.current !== id) return
        const t = Math.min(1, (performance.now() - t0) / ms)
        const e = easeInOutCubic(t)
        place({ x: from.x + (end.x - from.x) * e, y: from.y + (end.y - from.y) * e })
        if (t < 1) resetFrame.current = requestAnimationFrame(step)
        else {
          resetFrame.current = 0
          root?.removeAttribute('data-settling')
        }
      }
      step()
    })
  }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps

  const makeAct = useMemo(
    () => (signal: AbortSignal) =>
      createAct<S>(signal, {
        rootRef, cursorRef, pos, hovered, kindRef, keysRef, dragging, autoUsed, autoRef, scaleRef,
        speed, layout, cursor, resolve, place, remeasure, ripple, setState, setKind, setKeys, setLastKeys,
      }),
    [resolve, place, speed, layout], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    const stage = rootRef.current!
    if (still || !script) {
      reset()
      stage.removeAttribute('data-offscreen')
      setState(poster ?? initial)
      return cancelReset
    }
    reset()
    const root = fitRef.current!
    let ctrl: AbortController | null = null
    let onScreen = false
    let hovering = false
    let done = false

    const idle = cursor?.idle ?? 4000
    const LEAD = 1200
    let idleTimer = 0
    let revealTimer = 0
    const watchIdle = () => {
      window.clearInterval(idleTimer)
      if (!cursor || idle === false) return
      active.current = performance.now()
      idleTimer = window.setInterval(() => {
        const el = cursorRef.current
        if (!el) return
        const now = performance.now()
        if (!moved.current) {
          if (firstMove.current === null && now - active.current > LEAD) el.setAttribute('data-idle', '')
          return
        }
        if (el.hasAttribute('data-pressed') || rootRef.current?.querySelector('[data-hover]')) active.current = now
        else if (now - active.current > idle) el.setAttribute('data-idle', '')
      }, 150)
    }
    const beginLoop = () => {
      loopAt.current = performance.now()
      moved.current = false
      window.clearTimeout(revealTimer)
      const el = cursorRef.current
      const wait = firstMove.current
      if (idle === false || !el || wait === null || wait <= LEAD) return
      el.setAttribute('data-idle', '')
      revealTimer = window.setTimeout(() => el.removeAttribute('data-idle'), wait - 400)
    }
    const unwatchIdle = () => {
      window.clearInterval(idleTimer)
      window.clearTimeout(revealTimer)
      loopAt.current = 0
      cursorRef.current?.removeAttribute('data-idle')
    }
    const finishIdle = () => {
      window.clearInterval(idleTimer)
      window.clearTimeout(revealTimer)
      const el = cursorRef.current
      const held = () => el?.hasAttribute('data-pressed') || stage.querySelector('[data-hover]')
      if (!cursor || idle === false || !el || el.hasAttribute('data-idle') || held()) return
      const delay = (moved.current ? idle : LEAD) - (performance.now() - active.current)
      revealTimer = window.setTimeout(() => {
        if (!held()) el.setAttribute('data-idle', '')
      }, Math.max(0, delay))
    }

    const start = () => {
      if (ctrl || done || !onScreen || document.hidden) return
      if (play === 'hover' && !hovering) return
      cancelReset()
      if (cursor) place(resolve(restAt()))
      ctrl = new AbortController()
      const signal = ctrl.signal
      watchIdle()
      const act = makeAct(signal)
      ;(async () => {
        do {
          beginLoop()
          try {
            await script(act)
          } catch (e) {
            if (e instanceof Stopped) return
            console.error('[stageshow] script error', e)
            ctrl = null
            unwatchIdle()
            return
          }
          if (play === 'loop' && isDev()) checkSeam(stateRef.current, initial, pos.current, cursor ? resolve(restAt()) : null)
        } while (play === 'loop' && !signal.aborted)
        if (play === 'once' && !signal.aborted) {
          done = true
          finishIdle()
        }
      })()
    }
    const stop = (glide = false) => {
      unwatchIdle()
      if (!ctrl) return
      ctrl.abort()
      ctrl = null
      if (!done) reset(glide)
    }

    const markOffscreen = () => stage.toggleAttribute('data-offscreen', !onScreen || document.hidden)
    markOffscreen()
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      markOffscreen()
      onScreen ? start() : stop()
    })
    io.observe(root)
    const onVisibility = () => {
      markOffscreen()
      document.hidden ? stop() : start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const enter = () => {
      hovering = true
      start()
    }
    const leave = () => {
      hovering = false
      stop(true)
    }
    if (play === 'hover') {
      root.addEventListener('pointerenter', enter)
      root.addEventListener('pointerleave', leave)
    }
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      root.removeEventListener('pointerenter', enter)
      root.removeEventListener('pointerleave', leave)
      unwatchIdle()
      ctrl?.abort()
      ctrl = null
      autoRef.current = null
      cancelReset()
    }
  }, [still, script, makeAct, play, layout]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (cursor && !still && !dragging.current) autoRef.current?.(pos.current)
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  const look = useMemo(() => ({ theme, palette, fidelity, layout }), [theme, palette, fidelity, layout])
  const showCursor = cursor && (!script || !still || cursor.still)

  return (
    <div ref={fitRef} className={`ss-fit${className ? ` ${className}` : ''}`} style={{ maxWidth: grows ? undefined : width, height: designH * scale }}>
      <div
        ref={rootRef}
        className="ss-stage"
        data-specimen={specimen || undefined}
        data-unframed={unframed || undefined}
        data-still={still || undefined}
        data-placing={settling || undefined}
        data-theme={theme}
        data-palette={palette}
        data-greys={greys === 'cool' ? 'cool' : undefined}
        data-fidelity={fidelity}
        data-layout={layout}
        style={{
          width: designW,
          height: designH,
          marginLeft: inset || undefined,
          transform: `scale(${scale})`,
          ...tokens,
          ...(accent ? { ['--ss-accent' as string]: accent, ['--ss-accent-2' as string]: accent, ['--ss-accent-soft' as string]: `color-mix(in srgb, ${accent} 14%, transparent)` } : null),
        }}
      >
        {ground && (
          <div
            className="ss-ground"
            aria-hidden
            style={
              Array.isArray(ground)
                ? ({ ['--ss-orb-1' as string]: ground[0], ['--ss-orb-2' as string]: ground[1], ...(ground[2] ? { ['--ss-orb-3' as string]: ground[2] } : null) } as CSSProperties)
                : undefined
            }
          />
        )}
        <StillContext.Provider value={still}>
          <LookContext.Provider value={look}>{children(state, rectFor, layout)}</LookContext.Provider>
        </StillContext.Provider>
        {script && <Keycaps rows={[lastKeys, keys]} at={typeof keysAt === 'string' ? keysAt : keysAt[layout]} />}
        {showCursor && <Cursor cursorRef={cursorRef} style={cursor!.style} kind={kind} />}
      </div>
    </div>
  )
}
