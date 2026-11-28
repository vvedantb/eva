import type { CSSProperties } from 'react'
import { Bar, Facepile, Stage, Window, type Act, type Rect } from '../../kit'
import './presence.css'

type Spot = 'rest' | 'start' | 'end' | 'ins' | 'away'
type S = { maya: Spot; jon: Spot; sel: number; jonText: string; caret: boolean }

const initial: S = { maya: 'rest', jon: 'rest', sel: 0, jonText: '', caret: false }
const PEOPLE = { maya: '#d1478a', jon: '#2f9e8f' }

async function script(a: Act<S>) {
  await a.wait(700)
  a.mark('maya')
  a.put({ maya: 'start' })
  await a.wait(1000)
  a.put({ maya: 'end', sel: 1 })
  await a.wait(500)
  a.mark('jon')
  a.put({ jon: 'ins' })
  await a.wait(1100)
  a.put({ caret: true })
  await a.wait(250)
  await a.type('jonText', ' and EU', { interval: 110 })
  await a.wait(2400)
  a.mark('reset')
  a.put({ maya: 'away', jon: 'away', caret: false })
  await a.wait(700)
  a.put({ sel: 0, jonText: '' })
  await a.wait(700)
  a.put({ maya: 'rest', jon: 'rest' })
  await a.wait(900)
}

function spot(who: 'maya' | 'jon', at: Spot, sel: Rect, ins: Rect, doc: Rect): { x: number; y: number } {
  const right = doc.x + doc.width - 64
  if (!sel.width) return { x: -100, y: -100 }
  if (who === 'maya') {
    if (at === 'start') return { x: sel.x, y: sel.y + sel.height * 0.6 }
    if (at === 'end') return { x: sel.x + sel.width, y: sel.y + sel.height * 0.6 }
    if (at === 'away') return { x: sel.x - 60, y: sel.y - 70 }
    return { x: sel.x + 40, y: sel.y - 50 }
  }
  if (at === 'ins') return { x: Math.min(right, ins.x + 2), y: ins.y + ins.height * 0.75 }
  if (at === 'away') return { x: Math.min(right, ins.x + 120), y: ins.y + 100 }
  return { x: Math.min(right, ins.x + 70), y: ins.y + 74 }
}

export default function Presence() {
  return (
    <Stage<S> width={660} height={420} compact={{ below: 660, width: 358, height: 420 }} initial={initial} poster={{ maya: 'end', jon: 'ins', sel: 1, jonText: ' and EU', caret: true }} script={script} className="pr">
      {(s, rect) => {
        const sel = rect('sel')
        const ins = rect('ins')
        const doc = rect('doc')
        const m = spot('maya', s.maya, sel, ins, doc)
        const j = spot('jon', s.jon, sel, ins, doc)
        return (
          <>
            <Window title="Docs" className="pr-win" toolbar={<Facepile names={['Maya Chen', 'Jon Park', 'Ana Ruiz']} size={22} className="pr-pile" />}>
              <div className="pr-doc" data-target="doc">
                <div className="pr-title">Launch plan</div>
                <div className="pr-lines">
                  <Bar w="94%" h={7} r={3.5} tone={2} />
                  <Bar w="88%" h={7} r={3.5} tone={2} />
                  <Bar w="52%" h={7} r={3.5} tone={2} />
                </div>
                <p className="pr-p">
                  <span className="pr-sel" data-target="sel" data-on={s.sel || undefined} style={{ '--who': PEOPLE.maya } as CSSProperties}>
                    Pricing goes live on Thursday.
                  </span>{' '}
                  Checkout opens in the US
                  <span className="pr-anchor" data-target="ins" />
                  <span className="pr-typed" style={{ '--who': PEOPLE.jon } as CSSProperties}>
                    {s.jonText}
                    <span className="pr-caret" data-on={s.caret || undefined} key={s.jonText} />
                  </span>
                  .
                </p>
                <div className="pr-lines">
                  <Bar w="90%" h={7} r={3.5} tone={2} />
                  <Bar w="96%" h={7} r={3.5} tone={2} />
                  <Bar w="70%" h={7} r={3.5} tone={2} />
                  <Bar w="84%" h={7} r={3.5} tone={2} />
                </div>
              </div>
            </Window>
            <Peer name="Maya" color={PEOPLE.maya} at={m} />
            <Peer name="Jon" color={PEOPLE.jon} at={j} slow />
          </>
        )
      }}
    </Stage>
  )
}

function Peer({ name, color, at, slow }: { name: string; color: string; at: { x: number; y: number }; slow?: boolean }) {
  return (
    <span className="pr-peer" data-slow={slow || undefined} style={{ transform: `translate(${at.x}px, ${at.y}px)`, '--who': color } as CSSProperties}>
      <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden>
        <path d="M1.5 1.5v13.2l3.6-3.3 2.4 5.4 2.4-1-2.4-5.3h5.1Z" fill="var(--who)" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span className="pr-flag">{name}</span>
    </span>
  )
}
