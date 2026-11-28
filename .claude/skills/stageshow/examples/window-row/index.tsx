import { Badge, Bar, Check, Row, Stage, States, Text, Window, type Act } from '../../kit'
import './row.css'

type S = { done: number; ready: boolean }

const initial: S = { done: 0, ready: false }
const poster: S = { done: 4, ready: true }

const STEPS = ['Read the auth middleware', 'Found the redirect loop', 'Patched the session check', 'Tests passing, 48 of 48']

async function script(a: Act<S>) {
  await a.wait(900)
  for (let i = 1; i <= STEPS.length; i++) {
    a.mark(`step-${i}`)
    a.put({ done: i })
    await a.wait(i === STEPS.length ? 700 : 950)
  }
  a.mark('ready')
  a.put({ ready: true })
  await a.wait(2400)
}

function Busy({ rows }: { rows: number[] }) {
  return (
    <div className="wr-body">
      {rows.map((w, i) => (
        <Row key={i} pad={0} lead={<Check on={i < rows.length - 1} pending={i === rows.length - 1} />} title={<Bar w={w} h={7} r={3.5} tone={i < rows.length - 1 ? 3 : 2} />} />
      ))}
    </div>
  )
}

export default function WindowRow() {
  return (
    <Stage width={720} height={300} compact={{ below: 600, width: 358, height: 300 }} initial={initial} poster={poster} script={script} play="once" className="wr">
      {(s) => (
        <>
          <Window lights="grey" className="wr-win wr-win--left">
            <Busy rows={[150, 120, 170]} />
          </Window>
          <Window title="login-redirect" className="wr-win wr-win--hero">
            <div className="wr-body">
              {STEPS.map((step, i) => (
                <Row key={step} pad={0} className="wr-step" data-on={i < s.done || undefined} data-next={i === s.done || undefined} lead={<Check on={i < s.done} pending={i === s.done} />} title={<Text className="wr-label">{step}</Text>} />
              ))}
              <div className="wr-foot">
                <States
                  value={s.ready ? 'ready' : 'working'}
                  align="start"
                  states={{
                    working: <Badge tone="neutral">Working</Badge>,
                    ready: <Badge tone="success">Ready for review</Badge>,
                  }}
                />
              </div>
            </div>
          </Window>
          <Window lights="grey" className="wr-win wr-win--right">
            <Busy rows={[130, 160, 110, 140]} />
          </Window>
        </>
      )}
    </Stage>
  )
}
