import { Bar, Row, Stage, States, Text, Toggle, Window, type Act } from '../../kit'
import './close.css'

type S = { on: boolean }

const initial: S = { on: false }
const poster: S = { on: true }

async function script(a: Act<S>) {
  await a.wait(900)
  a.mark('click')
  await a.click({ at: 'toggle', x: 0.5, y: 0.5 })
  a.put({ on: true })
  await a.wait(500)
  await a.move({ at: 'toggle', x: 0.5, y: 2.6 })
  await a.wait(2100)
}

export default function CloseUp() {
  return (
    <Stage width={400} height={300} compact={{ below: 400, width: 358, height: 300 }} initial={initial} poster={poster} script={script} play="once" cursor={{ at: { x: 330, y: 270 }, style: 'large' }} className="cu">
      {(s) => (
        <div className="cu-zoom">
          <Window title="Security" className="cu-win">
            <div className="cu-list">
              <Row pad={0} className="cu-row" title={<Bar w={96} h={8} r={4} tone={3} />} subtitle={<Bar w={150} h={7} r={3.5} tone={2} />}>
                <Toggle on={false} />
              </Row>
              <Row
                pad={0}
                className="cu-row"
                title={<Text className="cu-title">Two-factor authentication</Text>}
                subtitle={
                  <States
                    value={s.on ? 'on' : 'off'}
                    align="start"
                    states={{
                      off: <Text className="cu-sub">Ask for a code at sign in</Text>,
                      on: <Text className="cu-sub">On for every sign in</Text>,
                    }}
                  />
                }
              >
                <Toggle on={s.on} data-target="toggle" data-cursor="pointer" />
              </Row>
              <Row pad={0} className="cu-row" title={<Bar w={120} h={8} r={4} tone={3} />} subtitle={<Bar w={104} h={7} r={3.5} tone={2} />}>
                <Toggle on={false} />
              </Row>
            </div>
          </Window>
        </div>
      )}
    </Stage>
  )
}
