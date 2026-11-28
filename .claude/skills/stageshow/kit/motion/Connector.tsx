import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Point } from '../measure'
import './Connector.css'

type Route = 'h' | 'v' | 'straight' | 'step' | 'curve'

export interface ConnectorProps {
  from: Point
  to: Point
  route?: Route
  show: boolean
  radius?: number
  dots?: 'end' | 'both' | 'none'
  arrow?: boolean
  label?: ReactNode
  labelAt?: number
  dashed?: boolean
  className?: string
}

/**
 * A line that ties one thing to another: an invoice to its plan, a row to its
 * detail card, a value to its annotation, a request to its endpoint. Points
 * are in stage pixels (from rect() or center()). Put it last in the scene so
 * it draws over both ends.
 */
export function Connector({ from, to, route = 'h', show, radius = 8, dots, arrow, label, labelAt = 0.5, dashed, className }: ConnectorProps) {
  const tip = arrow && route === 'curve' ? { x: to.x - Math.sign(to.x - from.x) * Math.min(8, Math.abs(to.x - from.x) / 3), y: to.y } : to
  const d = tip === to ? elbow(from, to, route, radius) : `${elbow(from, tip, route, radius)}L${to.x} ${to.y}`
  const ends = dots ?? (arrow ? 'none' : 'end')
  const line = useRef<SVGPathElement>(null)
  const reveal = useRef<SVGPathElement>(null)
  const revealId = `ss-connector-${useId().replace(/:/g, '')}`
  const [arrived, setArrived] = useState(false)
  useLayoutEffect(() => {
    const el = line.current
    if (!el) return
    if (!dashed) {
      el.style.removeProperty('stroke-dasharray')
      return
    }
    const len = el.getTotalLength()
    const n = Math.max(1, Math.round((len + 4) / 8))
    const dash = (len / (n * 2 - 1)).toFixed(3)
    el.style.strokeDasharray = `${dash} ${dash}`
  }, [d, dashed])
  useLayoutEffect(() => {
    const el = dashed ? reveal.current : line.current
    setArrived(false)
    if (!show || !el) return
    const property = 'stroke-dashoffset'
    const check = () => {
      const style = getComputedStyle(el)
      const complete = Math.abs(parseFloat(style.strokeDashoffset)) < .0001
      if (complete) setArrived(true)
    }
    const settle = (event: TransitionEvent) => {
      if (event.target === el && event.propertyName === property) check()
    }
    el.addEventListener('transitionend', settle)
    el.addEventListener('transitioncancel', settle)
    check()
    return () => {
      el.removeEventListener('transitionend', settle)
      el.removeEventListener('transitioncancel', settle)
    }
  }, [d, dashed, show])
  const pts = tip === to ? corners(from, to, route) : [...corners(from, tip, route), to]
  const q = pts[pts.length - 1]
  const p = pts.slice(0, -1).reverse().find(p => Math.hypot(q.x - p.x, q.y - p.y) > .001) ?? q
  const directionLength = Math.hypot(q.x - p.x, q.y - p.y)
  const len = directionLength || 1
  const ux = (q.x - p.x) / len
  const uy = (q.y - p.y) / len
  const head = `M${q.x - ux * 6 - uy * 4} ${q.y - uy * 6 + ux * 4}L${q.x} ${q.y}L${q.x - ux * 6 + uy * 4} ${q.y - uy * 6 - ux * 4}`
  const at = along(pts, labelAt)
  return (
    <>
      <svg className={`ss-connector${className ? ` ${className}` : ''}`} data-show={show || undefined} data-arrived={show && arrived || undefined} data-dashed={dashed || undefined} aria-hidden>
        {dashed && <defs><mask id={revealId} maskUnits="userSpaceOnUse"><path ref={reveal} className="ss-connector__reveal" d={d} pathLength="1" style={{ fill: 'none', stroke: '#fff', strokeWidth: 8 }} /></mask></defs>}
        <path ref={line} className="ss-connector__line" d={d} pathLength={dashed ? undefined : 1} mask={dashed ? `url(#${revealId})` : undefined} />
        {arrow && directionLength > .001 && <path d={head} className="ss-connector__arrow" />}
        {ends === 'both' && <circle cx={from.x} cy={from.y} r={3} className="ss-connector__dot ss-connector__dot--start" />}
        {ends !== 'none' && <circle cx={to.x} cy={to.y} r={3} className="ss-connector__dot" />}
      </svg>
      {label !== undefined && (
        <span className="ss-connector__label" data-show={show || undefined} data-arrived={show && arrived || undefined} data-step={typeof label === 'number' || undefined} style={{ left: at.x, top: at.y }}>
          {label}
        </span>
      )}
    </>
  )
}

function bend(a: Point, b: Point): [Point, Point] {
  const m = (a.x + b.x) / 2
  return [{ x: m, y: a.y }, { x: m, y: b.y }]
}

function corners(a: Point, b: Point, route: Route): Point[] {
  if (route === 'straight') return [a, b]
  if (route === 'curve') {
    const [c1, c2] = bend(a, b)
    return Array.from({ length: 25 }, (_, i) => {
      const t = i / 24
      const u = 1 - t
      return {
        x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
        y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
      }
    })
  }
  if (route === 'step') {
    const m = (a.x + b.x) / 2
    return [a, { x: m, y: a.y }, { x: m, y: b.y }, b]
  }
  return route === 'h' ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b]
}

function along(pts: Point[], f: number): Point {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
  let left = segs.reduce((n, s) => n + s, 0) * Math.max(0, Math.min(1, f))
  for (let i = 0; i < segs.length; i++) {
    if (left <= segs[i] || i === segs.length - 1) {
      const t = segs[i] ? Math.min(1, left / segs[i]) : 0
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }
    }
    left -= segs[i]
  }
  return pts[0]
}

function elbow(a: Point, b: Point, route: Route, r: number) {
  if (route === 'straight') return `M${a.x} ${a.y}L${b.x} ${b.y}`
  if (route === 'curve') {
    const [c1, c2] = bend(a, b)
    return `M${a.x} ${a.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`
  }
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (route === 'step') {
    const m = (a.x + b.x) / 2
    const k = Math.min(r, Math.abs(dx) / 2, Math.abs(dy) / 2)
    const sx = Math.sign(dx) || 1
    const sy = Math.sign(dy) || 1
    if (!k) return `M${a.x} ${a.y}H${m}V${b.y}H${b.x}`
    return `M${a.x} ${a.y}H${m - sx * k}Q${m} ${a.y} ${m} ${a.y + sy * k}V${b.y - sy * k}Q${m} ${b.y} ${m + sx * k} ${b.y}H${b.x}`
  }
  const k = Math.min(r, Math.abs(dx), Math.abs(dy))
  const sx = Math.sign(dx) || 1
  const sy = Math.sign(dy) || 1
  if (route === 'h') {
    return `M${a.x} ${a.y}H${b.x - sx * k}Q${b.x} ${a.y} ${b.x} ${a.y + sy * k}V${b.y}`
  }
  return `M${a.x} ${a.y}V${b.y - sy * k}Q${a.x} ${b.y} ${a.x + sx * k} ${b.y}H${b.x}`
}
