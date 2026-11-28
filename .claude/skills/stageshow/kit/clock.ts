/** What a recorder drives, at window.__stageshow.clock once installed. */
export interface ClockControl {
  readonly fps: number
  readonly frame: number
  now(): number
  step(frames?: number): Promise<void>
  advance(milliseconds: number): Promise<void>
  settle(): Promise<void>
  requestLayoutFrame(callback: FrameRequestCallback): number
  cancelLayoutFrame(id: number): void
  readonly layoutPending: boolean
  flushLayout(): Promise<void>
}

type Host = { __stageshow?: { clock?: ClockControl } }

/**
 * The clock the kit and its scenes read. Each call goes to the page's global
 * at call time, so under a recorder it is the virtual clock and otherwise
 * the real one.
 */
export const clock = {
  now: (): number => performance.now(),
  raf: (fn: FrameRequestCallback): number => requestAnimationFrame(fn),
  cancelRaf: (id: number): void => cancelAnimationFrame(id),
  layoutRaf: (fn: FrameRequestCallback): number => clock.recording?.requestLayoutFrame(fn) ?? requestAnimationFrame(fn),
  cancelLayoutRaf: (id: number): void => {
    const recording = clock.recording
    if (recording) recording.cancelLayoutFrame(id)
    else cancelAnimationFrame(id)
  },
  timeout: (fn: () => void, ms: number): number => window.setTimeout(fn, ms),
  clearTimeout: (id: number): void => window.clearTimeout(id),
  get recording(): ClockControl | null {
    return typeof window === 'undefined' ? null : ((window as unknown as Host).__stageshow?.clock ?? null)
  },
}

/**
 * Replace the page's clocks with a virtual one that only moves on step().
 * Self-contained (a recorder can inject its source as an init script), so it
 * must not reference anything outside its own body.
 *
 * `epoch` is the wall-clock time Date reports at frame 0, so a clock drawn
 * in a scene reads the same on every render.
 */
export function installVirtualClock(opts: { fps?: number; epoch?: number; onLayout?: () => void } = {}): ClockControl {
  const w = window as any
  if (w.__stageshow?.clock) return w.__stageshow.clock
  const fps = opts.fps ?? 60
  const RealDate = Date
  const epoch = opts.epoch ?? RealDate.now()
  const BASE = 1000
  let vt = BASE
  let frame = 0
  let fixedAnchor = BASE
  let fixedFrame = 0

  type Timer = { id: number; at: number; seq: number; fn: unknown; args: unknown[]; every: number | null }
  const timers = new Map<number, Timer>()
  let nextId = 1
  let seq = 0
  let frameCbs = new Map<number, FrameRequestCallback>()
  let layoutCbs = new Map<number, FrameRequestCallback>()

  const arm = (fn: unknown, ms: unknown, args: unknown[], every: boolean) => {
    const d = Math.max(0, Number(ms) || 0)
    const id = nextId++
    timers.set(id, { id, at: vt + d, seq: seq++, fn, args, every: every ? Math.max(1, d) : null })
    return id
  }
  w.setTimeout = (fn: unknown, ms?: unknown, ...args: unknown[]) => arm(fn, ms, args, false)
  w.setInterval = (fn: unknown, ms?: unknown, ...args: unknown[]) => arm(fn, ms, args, true)
  w.clearTimeout = w.clearInterval = (id: number) => void timers.delete(id)
  w.requestAnimationFrame = (fn: FrameRequestCallback) => {
    const id = nextId++
    frameCbs.set(id, fn)
    return id
  }
  w.cancelAnimationFrame = (id: number) => void frameCbs.delete(id)
  performance.now = () => vt
  const dateNow = () => Math.floor(epoch + (vt - BASE))
  const VDate = function (this: unknown, ...a: unknown[]) {
    if (!new.target) return new RealDate(dateNow()).toString()
    return a.length ? new (RealDate as any)(...a) : new RealDate(dateNow())
  } as unknown as DateConstructor
  Object.assign(VDate, { prototype: RealDate.prototype, now: dateNow, parse: RealDate.parse, UTC: RealDate.UTC })
  w.Date = VDate

  const tick = () =>
    new Promise<void>((r) => {
      const c = new MessageChannel()
      c.port1.onmessage = () => {
        c.port1.close()
        c.port2.close()
        r()
      }
      c.port2.postMessage(0)
    })
  const settle = async () => {
    for (let i = 0; i < 4; i++) await tick()
    scan()
  }
  const run = (fn: unknown, args: unknown[]) => {
    try {
      if (typeof fn === 'function') fn(...args)
    } catch (e) {
      console.error(e)
    }
  }

  type Held = { local: number; rate: number; born: number }
  const held = new WeakMap<Animation, Held>()
  const live = new Set<Animation>()
  const scan = () => {
    for (const a of document.getAnimations()) {
      if (held.has(a) || a.playState === 'finished' || a.playState === 'idle') continue
      held.set(a, { local: 0, rate: a.playbackRate || 1, born: vt })
      a.playbackRate = 0
      a.currentTime = 0
      live.add(a)
    }
  }
  const moveAnimations = (from: number) => {
    scan()
    for (const a of Array.from(live)) {
      const h = held.get(a)!
      if (a.playState === 'idle' || a.playState === 'finished') {
        live.delete(a)
        continue
      }
      if (a.playState !== 'paused') h.local += (vt - Math.max(from, h.born)) * h.rate
      const end = a.effect?.getComputedTiming().endTime
      if (typeof end === 'number' && Number.isFinite(end) && h.local >= end) {
        a.pause()
        a.playbackRate = h.rate
        a.finish()
        live.delete(a)
      } else {
        a.currentTime = h.local
      }
    }
  }

  const stepTo = async (to: number) => {
    const from = vt
    await settle()
    for (let guard = 0; guard < 10000; guard++) {
      let next: Timer | null = null
      for (const t of Array.from(timers.values())) if (t.at <= to + 1e-6 && (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq))) next = t
      if (!next) break
      vt = next.at
      if (next.every === null) timers.delete(next.id)
      else {
        next.at += next.every
        next.seq = seq++
      }
      run(next.fn, next.args)
      await settle()
    }
    vt = to
    frame++
    const cbs = frameCbs
    const layout = layoutCbs
    frameCbs = new Map()
    layoutCbs = new Map()
    for (const fn of Array.from(layout.values())) run(fn, [vt])
    for (const fn of Array.from(cbs.values())) run(fn, [vt])
    await settle()
    moveAnimations(from)
  }

  const control: ClockControl = {
    fps,
    get frame() {
      return frame
    },
    now: () => vt,
    async step(n = 1) {
      for (let i = 0; i < n; i++) await stepTo(fixedAnchor + (++fixedFrame * 1000) / fps)
    },
    async advance(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError('Clock advance must be a finite, non-negative duration')
      if (milliseconds === 0) return
      await stepTo(vt + milliseconds)
      fixedAnchor = vt
      fixedFrame = 0
    },
    settle,
    requestLayoutFrame(callback) {
      const empty = layoutCbs.size === 0
      const id = nextId++
      layoutCbs.set(id, callback)
      if (empty) opts.onLayout?.()
      return id
    },
    cancelLayoutFrame: (id) => void layoutCbs.delete(id),
    get layoutPending() { return layoutCbs.size > 0 },
    async flushLayout() {
      await settle()
      const callbacks = layoutCbs
      layoutCbs = new Map()
      for (const fn of Array.from(callbacks.values())) run(fn, [vt])
      await settle()
    },
  }
  w.__stageshow = { ...(w.__stageshow ?? {}), clock: control }
  return control
}
