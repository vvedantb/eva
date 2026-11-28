import { useRef } from 'react'
import { Chart, Roll, Stage, Window, chartPoints, type Act } from '../../kit'
import './scrub.css'

type S = { day: number | null; x: number | null }

const DAYS = [3240, 3610, 3480, 4120, 3950, 4630, 4410, 5240, 4920, 5810, 5530, 6320, 6050, 6890]
const NAMES = ['Oct 15', 'Oct 16', 'Oct 17', 'Oct 18', 'Oct 19', 'Oct 20', 'Oct 21', 'Oct 22', 'Oct 23', 'Oct 24', 'Oct 25', 'Oct 26', 'Oct 27', 'Oct 28']
const TOTAL = DAYS.reduce((n, d) => n + d, 0)
const money = (n: number) => `$${n.toLocaleString('en-US')}`

const W = { wide: 492, compact: 280 }
const H = 150

async function script(a: Act<S>) {
  await a.wait(900)
  const box = a.rect('plot')
  const pts = chartPoints({ data: DAYS, width: box.width, height: H, dot: false })
  const at = (i: number) => ({ x: box.x + pts[i]!.x, y: box.y + pts[i]!.y + 18 })
  a.mark('hover')
  await a.move(at(4), { duration: 700 })
  a.put({ day: 4, x: pts[4]!.x })
  await a.wait(700)
  a.mark('scrub')
  await a.move(at(DAYS.length - 1), {
    duration: 1500,
    path: (e, from, to) => ({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }),
    onMove: (pt) => {
      const x = Math.max(0, Math.min(box.width, pt.x - box.x))
      let near = 0
      for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i]!.x - x) < Math.abs(pts[near]!.x - x)) near = i
      a.put({ day: near, x })
    },
  })
  await a.wait(1900)
  a.mark('leave')
  let gone = false
  await a.move({ x: box.x + box.width + 40, y: box.y + box.height + 60 }, {
    duration: 600,
    onMove: (pt) => {
      if (!gone && (pt.x > box.x + box.width || pt.y > box.y + box.height)) {
        gone = true
        a.put({ day: null })
      }
    },
  })
  await a.wait(1600)
}

function yOn(path: SVGPathElement | null | undefined, x: number) {
  if (!path) return null
  let lo = 0
  let hi = path.getTotalLength()
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (path.getPointAtLength(mid).x < x) lo = mid
    else hi = mid
  }
  return path.getPointAtLength(hi).y
}

export default function ChartScrub() {
  const plot = useRef<HTMLDivElement>(null)
  return (
    <Stage<S> width={640} height={400} compact={{ below: 640, width: 358, height: 400 }} initial={{ day: null, x: null }} poster={{ day: 13, x: null }} script={script} cursor={{ at: { x: 560, y: 360 } }} className="cs">
      {(s, _rect, layout) => {
        const w = layout === 'compact' ? W.compact : W.wide
        const pts = chartPoints({ data: DAYS, width: w, height: H, dot: false })
        const hx = s.x ?? (s.day === null ? null : pts[s.day]!.x)
        const on = s.day !== null
        const hy = hx === null ? null : (yOn(plot.current?.querySelector<SVGPathElement>('.ss-chart__line'), hx) ?? pts[s.day ?? 0]!.y)
        const p = hx === null || hy === null ? null : { x: hx, y: hy }
        return (
          <Window title="Revenue" className="cs-win">
            <div className="cs-body">
              <div className="cs-head">
                <div className="cs-label">
                  <Roll variant="fade">{s.day === null ? 'Last 14 days' : NAMES[s.day]!}</Roll>
                </div>
                <div className="cs-value">
                  <Roll stagger={25}>{money(s.day === null ? TOTAL : DAYS[s.day]!)}</Roll>
                </div>
              </div>
              <div ref={plot} className="cs-plot" data-target="plot" data-cursor="crosshair" style={{ width: w, height: H }}>
                <Chart data={DAYS} width={w} height={H} dot={false} />
                <span className="cs-hair" data-on={p && on ? '' : undefined} style={p ? { left: p.x } : undefined} />
                <span className="cs-dot" data-on={p && on ? '' : undefined} style={p ? { left: p.x, top: p.y } : undefined} />
              </div>
              <div className="cs-axis" style={{ width: w }}>
                <span>Oct 15</span>
                <span>Oct 28</span>
              </div>
            </div>
          </Window>
        )
      }}
    </Stage>
  )
}
