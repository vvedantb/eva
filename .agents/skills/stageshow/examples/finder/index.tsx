import { useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  AppWindow,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Download,
  File,
  FileText,
  Folder,
  HardDrive,
  LayoutGrid,
  List,
  Maximize2,
  Monitor,
  Search,
  Share,
  X,
} from 'lucide-react'
import { Bar, Collapse, Stage, Text, Window, type Act, type Layout, type Point } from '../../kit'
import './finder.css'

type Ghost = { on: boolean; dropped: boolean; off: Point; at: Point }
type S = { sel: boolean; ql: boolean; moved: boolean; ghost: Ghost }

const initial: S = { sel: false, ql: false, moved: false, ghost: { on: false, dropped: false, off: { x: 0, y: 0 }, at: { x: 0, y: 0 } } }

const FILE = 'Fuji.jpg'
const DROP = 'Wallpapers'

type Geo = {
  win: { x: number; y: number; w: number; h: number }
  side: number
  rows: number
  cols: string
  ql: { x: number; y: number; w: number }
}

const GEO: Record<Layout, Geo> = {
  wide: { win: { x: 40, y: 40, w: 880, h: 500 }, side: 180, rows: 10, cols: 'minmax(0, 1fr) 150px 76px 120px', ql: { x: 350, y: 66, w: 380 } },
  compact: { win: { x: 24, y: 24, w: 520, h: 420 }, side: 150, rows: 8, cols: '196px 140px 70px 110px', ql: { x: 68, y: 72, w: 264 } },
}

const QL_BAR = 38
const qlHeight = (w: number) => QL_BAR + Math.round((w * 3) / 4)

type Kind = 'folder' | 'doc' | 'image' | 'hero'
const ROWS: { kind: Kind; name: number; date: number; size: number; type: number }[] = [
  { kind: 'folder', name: 92, date: 88, size: 14, type: 40 },
  { kind: 'doc', name: 124, date: 80, size: 34, type: 72 },
  { kind: 'folder', name: 70, date: 92, size: 14, type: 40 },
  { kind: 'hero', name: 0, date: 84, size: 38, type: 64 },
  { kind: 'image', name: 108, date: 76, size: 36, type: 64 },
  { kind: 'doc', name: 86, date: 90, size: 30, type: 78 },
  { kind: 'folder', name: 116, date: 84, size: 14, type: 40 },
  { kind: 'doc', name: 98, date: 78, size: 40, type: 70 },
  { kind: 'image', name: 80, date: 88, size: 34, type: 64 },
  { kind: 'doc', name: 112, date: 82, size: 32, type: 74 },
]

async function script(a: Act<S>) {
  await a.wait(500)

  a.mark('select')
  const row = a.rect('row-hero')
  await a.click({ x: row.x + 176, y: row.y + row.height * 0.6 })
  await a.set({ sel: true })
  await a.wait(650)

  a.mark('open')
  await a.key('space')
  await a.set({ ql: true })
  await a.wait(2400)

  a.mark('close')
  await a.key('space')
  await a.set({ ql: false })
  await a.wait(700)

  a.mark('drag')
  const icon = a.rect('hero-drag')
  const thumb = a.rect('thumb')
  const grab = { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 + 1 }
  await a.move(grab)
  await a.wait(220)
  const line = a.rect('row-hero')
  const off = { x: grab.x - icon.x, y: grab.y - line.y }
  const drop = a.rect('side-drop')
  await a.drag({ x: drop.x + 114, y: drop.y + drop.height * 0.55 }, (at) => {
    a.put({ ghost: { on: true, dropped: false, off, at } })
  }, { duration: 1150, cursor: 'preserve' })
  a.mark('drop')
  await a.set((s) => ({ moved: true, ghost: { ...s.ghost, dropped: true } }))
  await a.wait(1900)

  a.mark('undo')
  await a.key('cmd+z')
  await a.set({ moved: false, ghost: initial.ghost })
  await a.wait(1100)

  await a.click({ at: 'blank', x: 0.56, y: 0.5 })
  await a.set({ sel: false })
  await a.wait(900)
}

export default function FinderDemo() {
  return (
    <Stage<S>
      width={820}
      height={420}
      compact={{ below: 560, width: 400, height: 340 }}
      initial={initial}
      script={script}
      accent="#0a6de6"
      cursor={{ at: { at: 'blank', x: 0.56, y: 0.5 } }}
      className="fq"
    >
      {(s, rect, layout) => {
        const g = GEO[layout]
        const qh = qlHeight(g.ql.w)
        const t = rect('thumb')
        const k = t.width ? t.width / g.ql.w : 0.05
        const box = s.ql
          ? { left: g.ql.x, top: g.ql.y, width: g.ql.w, height: qh, borderRadius: 12 }
          : { left: t.x, top: t.y + t.height / 2 - (qh * k) / 2, width: g.ql.w * k, height: qh * k, borderRadius: 12 * k }
        return (
          <>
            <Window
              className="fq-window"
              style={{ left: g.win.x, top: g.win.y, width: g.win.w, height: g.win.h }}
              sidebarWidth={g.side}
              sidebar={<Sidebar />}
              lead={
                <span className="fq-lead">
                  <span className="fq-nav">
                    <ChevronLeft size={17} strokeWidth={1.75} />
                    <ChevronRight size={17} strokeWidth={1.75} className="fq-nav-off" />
                  </span>
                  <span className="fq-heading">Downloads</span>
                </span>
              }
              toolbar={
                <span className="fq-tools">
                  <span className="fq-views">
                    <span className="fq-view">
                      <LayoutGrid size={14} strokeWidth={1.75} />
                    </span>
                    <span className="fq-view" data-on>
                      <List size={15} strokeWidth={1.75} />
                    </span>
                  </span>
                  <Share size={15} strokeWidth={1.75} />
                  <Search size={15} strokeWidth={1.75} />
                </span>
              }
              body={{ className: 'fq-body', 'data-crop': true }}
            >
              <div className="fq-list" style={{ ['--cols' as string]: g.cols }}>
                <div className="fq-head">
                  <span>Name</span>
                  <span>Date Modified</span>
                  <span>Size</span>
                  <span>Kind</span>
                </div>
                <div className="fq-rows">
                  <div className="fq-stripes" aria-hidden>
                    {Array.from({ length: g.rows + 4 }, (_, i) => (
                      <span key={i} />
                    ))}
                  </div>
                  {ROWS.slice(0, g.rows).map((r, i) =>
                    r.kind === 'hero' ? (
                      <Collapse key={i} open={!s.moved}>
                        <Row r={r} hero sel={s.sel} />
                      </Collapse>
                    ) : (
                      <Row key={i} r={r} />
                    ),
                  )}
                  <div className="fq-blank" data-target="blank" />
                </div>
              </div>
            </Window>

            <div
              className="fq-ql"
              data-open={s.ql || undefined}
              style={box}
            >
              <div className="fq-ql__bar" style={{ height: s.ql ? 38 : 38 * k }}>
                <span className="fq-ql__btns">
                  <X size={14} strokeWidth={1.75} />
                  <Maximize2 size={12} strokeWidth={1.75} />
                </span>
                <span className="fq-ql__title">{FILE}</span>
                <span className="fq-ql__right">
                  {layout === 'wide' && <span className="fq-ql__open">Open with Preview</span>}
                  <Share size={14} strokeWidth={1.75} />
                </span>
              </div>
              <Photo className="fq-ql__photo" />
            </div>

            <DragImage ghost={s.ghost}>
              <span className="fq-thumb">
                <Photo />
              </span>
              <span className="fq-drag__name">{FILE}</span>
            </DragImage>
          </>
        )
      }}
    </Stage>
  )
}

function Sidebar() {
  const item = (icon: ReactNode, label: ReactNode, extra?: Record<string, unknown>) => (
    <div className="fq-side__item" {...extra}>
      <span className="fq-side__icon">{icon}</span>
      {label}
    </div>
  )
  const ic = { size: 15, strokeWidth: 1.6 }
  return (
    <div className="fq-side">
      <Bar w={44} h={5} tone={3} className="fq-side__label" />
      {item(<Clock {...ic} />, <Bar w={46} h={6} tone={3} />)}
      {item(<AppWindow {...ic} />, <Bar w={64} h={6} tone={3} />)}
      {item(<Monitor {...ic} />, <Bar w={42} h={6} tone={3} />)}
      {item(<FileText {...ic} />, <Bar w={58} h={6} tone={3} />)}
      {item(<Download {...ic} />, <Text>Downloads</Text>, { 'data-current': true })}
      {item(<Folder {...ic} />, <Text>{DROP}</Text>, { 'data-target': 'side-drop', 'data-drop': true })}
      <Bar w={52} h={5} tone={3} className="fq-side__label" />
      {item(<Cloud {...ic} />, <Bar w={56} h={6} tone={3} />)}
      {item(<HardDrive {...ic} />, <Bar w={70} h={6} tone={3} />)}
    </div>
  )
}

function Row({ r, hero, sel }: { r: (typeof ROWS)[number]; hero?: boolean; sel?: boolean }) {
  return (
    <div className="fq-row" data-sel={sel || undefined} data-target={hero ? 'row-hero' : undefined}>
      <span className="fq-name">
        <span className="fq-name__drag" data-target={hero ? 'hero-drag' : undefined}>
          <FileIcon kind={r.kind} />
          {hero ? <span className="fq-name__text">{FILE}</span> : <Bar w={r.name} h={6} tone={3} />}
        </span>
      </span>
      <Bar w={r.date} h={6} tone={2} />
      {r.kind === 'folder' ? <Bar w={r.size} h={2} tone={3} /> : <Bar w={r.size} h={6} tone={2} />}
      <Bar w={r.type} h={6} tone={2} />
    </div>
  )
}

function FileIcon({ kind }: { kind: Kind }) {
  if (kind === 'folder') return <Folder size={16} strokeWidth={1.25} className="fq-folder" />
  if (kind === 'doc') return <File size={16} strokeWidth={1.25} className="fq-doc" />
  return (
    <span className="fq-thumb" data-target={kind === 'hero' ? 'thumb' : undefined}>
      <Photo alt={kind === 'image'} />
    </span>
  )
}

const PHOTO = new URL('../wikipedia/kawaguchiko.jpg', import.meta.url).href
const ALT_PHOTO = new URL('../wikipedia/fuji.jpg', import.meta.url).href
function Photo({ className, alt }: { className?: string; alt?: boolean }) {
  return <img className={`fq-photo${className ? ` ${className}` : ''}`} src={alt ? ALT_PHOTO : PHOTO} alt="" draggable={false} />
}

function DragImage({ ghost, children }: { ghost: Ghost; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const over = useRef<HTMLElement | null>(null)
  const following = ghost.on && !ghost.dropped
  const { x: ox, y: oy } = ghost.off
  const { x, y } = ghost.at
  useLayoutEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.ss-stage')
    let next: HTMLElement | null = null
    if (following && root) {
      const box = root.getBoundingClientRect()
      const scale = box.width / root.offsetWidth || 1
      const hit = document.elementFromPoint(box.left + x * scale, box.top + y * scale)?.closest<HTMLElement>('[data-drop]') ?? null
      if (hit && root.contains(hit)) next = hit
    }
    if (next !== over.current) {
      over.current?.removeAttribute('data-over')
      next?.setAttribute('data-over', '')
      over.current = next
    }
  }, [following, x, y])
  useLayoutEffect(() => () => over.current?.removeAttribute('data-over'), [])
  return (
    <div ref={ref} className="fq-drag" data-show={following || undefined} data-dropped={ghost.dropped || undefined} style={{ transform: `translate(${x - ox}px, ${y - oy}px)` }} aria-hidden>
      <div className="fq-drag__inner" style={{ transformOrigin: `${ox}px ${oy}px` }}>
        {children}
      </div>
    </div>
  )
}
