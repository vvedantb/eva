import { Chart, Icon, Meter, Stage, Text, type Act } from '../../kit'
import './stacked.css'

type S = { on: boolean }

const BARS = [8, 12, 9, 15, 13, 18, 11, 17, 22, 16, 20, 26, 21, 29, 24, 31, 27, 34]

async function script(a: Act<S>) {
  await a.wait(500)
  a.put({ on: true })
  await a.wait(3000)
}

export default function StackedCards() {
  return (
    <Stage width={520} height={400} compact={{ below: 520, width: 358, height: 400 }} initial={{ on: false }} poster={{ on: true }} script={script} play="once" className="sk">
      {(s, _rect, layout) => (
        <div className="sk-stack">
          <section className="sk-card">
            <div className="sk-plan">
              <span className="sk-mark"><Icon name="bolt" size={14} /></span>
              <div className="sk-who">
                <Text className="sk-name">Pro plan</Text>
                <Text className="sk-sub">$49 per month</Text>
              </div>
            </div>
            <div className="sk-usage">
              <Text className="sk-label">API calls</Text>
              <Text className="sk-value">4.2M of 5M</Text>
            </div>
            <Meter value={s.on ? 0.84 : 0} />
          </section>
          <section className="sk-card">
            <Text className="sk-label">Calls, last 18 days</Text>
            <Chart kind="bars" className="sk-chart" data={BARS} width={layout === 'compact' ? 286 : 300} height={140} show={s.on} />
          </section>
        </div>
      )}
    </Stage>
  )
}
