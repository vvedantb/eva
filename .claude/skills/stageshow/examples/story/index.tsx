import { Stage, Window, Bar, Icon, Connector, Count, Roll, Meter, Segmented, Chart, type Act } from '../../kit'
import './story.css'

type Tier = 'volume' | 'graduated'
type S = { show: number; tokens: number; tier: Tier; usage: number; resetting: boolean }

const START = { resetting: false, show: 1, tokens: 1_968_086_209, tier: 'volume' as Tier, usage: 0.52 }
const PRICE: Record<Tier, number> = { volume: 0.01, graduated: 0.0098 }
const BARS = [6, 10, 8, 14, 12, 18, 9, 16, 22, 15, 19, 26, 21, 30, 17, 24, 33, 28, 20, 36, 31, 27, 40, 34, 29, 44]

const TICKS = [18_420, 9_310, 22_870, 12_040, 15_660, 26_190, 11_480, 19_930]

const script = async (a: Act<S>) => {
  a.mark('reveal')
  await a.wait(500)
  a.put({ show: 2 })
  await a.wait(900)
  a.put({ show: 3 })
  await a.wait(900)
  a.mark('live')
  a.put({ show: 4 })
  for (const n of TICKS.slice(0, 4)) {
    await a.wait(650)
    a.put((s) => ({ tokens: s.tokens + n, usage: Math.min(0.8, s.usage + 0.03) }))
  }
  a.mark('tier')
  await a.click({ at: 'graduated', x: 0.84, y: 0.72 })
  a.put({ tier: 'graduated' })
  await a.wait(300)
  for (const n of TICKS.slice(4)) {
    await a.wait(650)
    a.put((s) => ({ tokens: s.tokens + n, usage: Math.min(0.8, s.usage + 0.03) }))
  }
  await a.move('rest')
  await a.wait(2000)
  a.mark('exit')
  await a.set({ show: 1 })
  await a.wait(900)
  await a.set({ resetting: true })
  await a.wait(220)
  await a.snap({ ...START, resetting: true })
  await a.set({ resetting: false })
  await a.wait(300)
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function Story() {
  return (
    <Stage<S> specimen width={640} height={452} compact={{ below: 600, width: 358, height: 610 }} initial={START} poster={{ ...START, show: 4, tier: 'graduated' }} script={script} cursor={{ at: 'rest' }} className="st">
      {(s, rect, layout) => {
        const amount = (s.tokens / 1000) * PRICE[s.tier]
        const ref = rect('inv-ref')
        const plan = rect('plan')
        return (
          <>
            <div className="st-wash" />
            <Window className="st-invoice" data-in={s.show >= 1 || undefined}>
              <div className="st-inv" data-reset={s.resetting || undefined}>
                <div className="st-inv__head">
                  <span className="st-inv__title">Invoice</span>
                  <Bar w={54} h={6} tone={2} data-target="inv-ref" />
                </div>
                <div className="st-inv__meta">
                  {[[46, 70], [38, 58], [52, 64]].map(([a, b], i) => (
                    <div key={i}>
                      <Bar w={a} h={5} tone={3} />
                      <Bar w={b} h={5} tone={2} />
                    </div>
                  ))}
                </div>
                <div className="st-inv__due">
                  <Count value={amount} format={money} duration={600} /> <span>due Oct 1</span>
                </div>
                <div className="st-inv__row st-inv__row--head">
                  <span>Description</span>
                  <span>Qty</span>
                </div>
                <div className="st-inv__row" data-target="line-item">
                  <span className="st-strong">Cloud tokens</span>
                  <Count value={s.tokens} duration={600} className="st-qty" />
                </div>
                <div className="st-inv__row">
                  <Bar w={64} h={5} tone={2} />
                  <Bar w={40} h={5} tone={2} />
                </div>
              </div>
            </Window>

            <div className="st-plan" data-target="plan" data-in={s.show >= 2 || undefined}>
              <div className="st-plan__head">
                <span className="st-plan__mark">
                  <Icon name="card" size={14} filled />
                </span>
                <span>
                  <span className="st-strong">Pro plan</span>
                  <br />
                  <span className="st-muted">Billed monthly</span>
                </span>
              </div>
              <div className="st-plan__price">
                <span className="st-strong">Tokens</span>
                <span className="st-muted">
                  <Roll>{`$${PRICE[s.tier]} per 1,000`}</Roll>
                </span>
              </div>
              <Segmented className="st-seg" items={['Volume', 'Graduated']} value={s.tier === 'volume' ? 0 : 1} targets={['volume', 'graduated']} cursor="hand" />
              <Meter value={s.show >= 4 ? s.usage : 0} />
            </div>

            <div className="st-chart" data-in={s.show >= 2 || undefined}>
              <span className="st-muted">Tokens used, last 30 days</span>
              <Chart kind="bars" className="st-bars" data={BARS} width={layout === 'compact' ? 270 : 204} height={92} show={s.show >= 4} />
              <div className="st-axis">
                <span>Sep 21</span>
                <span>Oct 21</span>
              </div>
            </div>

            {ref.width > 0 && plan.width > 0 && (
              <Connector
                show={s.show >= 3}
                from={{ x: ref.x + ref.width + 8, y: ref.y + ref.height / 2 }}
                to={{ x: plan.x + plan.width * 0.7, y: plan.y }}
                route="h"
              />
            )}
            <span data-target="rest" style={{ position: 'absolute', left: layout === 'compact' ? 330 : 610, top: layout === 'compact' ? 590 : 432 }} />
          </>
        )
      }}
    </Stage>
  )
}
