import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { GitBranch, GitCommitHorizontal } from 'lucide-react'
import { Badge, Bar, Collapse, Spinner, Stage, Window, type Act } from '../../kit'
import './hero.css'

type S = { open: boolean; ready: boolean; t: number }

const initial: S = { open: false, ready: false, t: 0 }

async function script(a: Act<S>) {
  await a.wait(900)
  a.mark('deploy')
  a.put({ open: true })
  for (let t = 1; t <= 4; t++) {
    await a.wait(520)
    a.put({ t: t * 9 })
  }
  await a.wait(300)
  a.mark('ready')
  a.put({ ready: true, t: 38 })
  await a.wait(2000)
  a.put({ open: false })
  await a.wait(700)
  await a.snap({ ready: false, t: 0 })
}

const OLD = [
  { msg: 'Fix pricing copy', when: '2h ago', t: '41s' },
  { msg: null, when: null, t: null },
  { msg: null, when: null, t: null },
  { msg: null, when: null, t: null },
]

export default function DarkHero() {
  return (
    <Stage<S> width={760} height={440} compact={{ below: 760, width: 358, height: 440 }} theme="dark" initial={initial} poster={{ open: true, ready: true, t: 38 }} script={script} className="dh">
      {(s, _rect, layout) => (
        <Window url="app.shipyard.dev/northwind/deployments" className="dh-win" sidebarWidth={168} sidebar={layout === 'compact' ? undefined : <Side />}>
          <div className="dh-body">
            <header className="dh-head">
              <div className="dh-title">Deployments</div>
              <span className="dh-proj">
                <Bar w={14} h={14} r={4} tone={3} />
                northwind-web
              </span>
            </header>
            <div className="dh-list">
              <Collapse open={s.open} reveal="drop">
                <Row
                  lead
                  msg="Add annual plans"
                  hash="a41c9e2"
                  when="Just now"
                  status={
                    <Badge tone={s.ready ? 'success' : 'neutral'} className="dh-badge" icon={<Mark ready={s.ready} />}>
                      <Label ready={s.ready} />
                    </Badge>
                  }
                  time={`${s.t}s`}
                  current={s.ready}
                />
              </Collapse>
              {OLD.map((r, i) =>
                r.msg ? (
                  <Row key={i} msg={r.msg} hash="7d02b18" when={r.when!} status={<Badge tone="neutral" className="dh-badge dh-badge--old" icon={<Mark ready />}>Ready</Badge>} time={r.t!} current={!(s.open && s.ready)} />
                ) : (
                  <div key={i} className="dh-row dh-row--filler">
                    <span className="dh-lines">
                      <Bar w={[180, 150, 200][i - 1]} h={8} r={4} tone={2} />
                      <Bar w={110} h={7} r={3.5} tone={1} />
                    </span>
                    <Bar w={52} h={18} r={9} tone={1} />
                    <Bar w={28} h={7} r={3.5} tone={1} />
                  </div>
                ),
              )}
            </div>
          </div>
        </Window>
      )}
    </Stage>
  )
}

function Mark({ ready }: { ready: boolean }) {
  return (
    <span className="dh-mark" data-ready={ready || undefined}>
      <Spinner size={8} />
      <i className="dh-dot" />
    </span>
  )
}

function Label({ ready }: { ready: boolean }) {
  const words = useRef<HTMLSpanElement[]>([])
  const [w, setW] = useState<number[]>([])
  useLayoutEffect(() => setW(words.current.map(e => e.offsetWidth)), [])
  const on = ready ? 1 : 0
  const shrink = w.length === 2 && w[on]! < w[1 - on]!
  return (
    <span className="dh-label" data-shrink={shrink || undefined} style={w.length ? { width: w[on] } : undefined}>
      {['Building', 'Ready'].map((t, i) => (
        <span key={t} ref={e => { if (e) words.current[i] = e }} className="dh-word" data-on={i === on || undefined}>{t}</span>
      ))}
    </span>
  )
}

function Row({ lead, msg, hash, when, status, time, current }: { lead?: boolean; msg: string; hash: string; when: string; status: ReactNode; time: ReactNode; current: boolean }) {
  return (
    <div className="dh-row" data-lead={lead || undefined}>
      <span className="dh-lines">
        <span className="dh-msg">
          {msg}
          <span className="dh-current" data-on={current || undefined}>Current</span>
        </span>
        <span className="dh-meta">
          <span className="dh-meta__item"><GitBranch size={12} strokeWidth={2} />main</span>
          <span className="dh-meta__item"><GitCommitHorizontal size={12} strokeWidth={2} />{hash}</span>
          <span className="dh-when">{when}</span>
        </span>
      </span>
      {status}
      <span className="dh-time">{time}</span>
    </div>
  )
}

function Side() {
  return (
    <nav className="dh-side">
      {[64, 88, 52, 76, 60].map((w, i) => (
        <span key={i} className="dh-nav" data-active={i === 1 || undefined}>
          <Bar w={12} h={12} r={3} tone={i === 1 ? 4 : 2} />
          <Bar w={w} h={6} tone={i === 1 ? 4 : 2} />
        </span>
      ))}
    </nav>
  )
}
