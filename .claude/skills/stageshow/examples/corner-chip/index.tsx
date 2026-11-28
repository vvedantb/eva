import { Avatar, Bar, Facepile, Row, Stage, Text, Window, type Act } from '../../kit'
import './chip.css'

type S = { on: boolean }

async function script(a: Act<S>) {
  await a.wait(600)
  a.put({ on: true })
  await a.wait(2600)
}

export default function CornerChip() {
  return (
    <Stage width={520} height={360} compact={{ below: 520, width: 358, height: 360 }} initial={{ on: false }} poster={{ on: true }} script={script} play="once" className="cc">
      {(s) => (
        <>
          <Window title="Support" className="cc-win">
            <div className="cc-list">
              <Row
                selected
                lead={<Avatar name="Priya Nair" size={28} />}
                title={<Text>Priya Nair</Text>}
                meta={<Text>2m</Text>}
                subtitle={<Text>Can I move my plan to annual billing?</Text>}
              />
              {[180, 150, 200, 140].map((w, i) => (
                <Row key={i} lead={<Avatar size={28} />} title={<Bar w={80} h={7} r={3.5} tone={3} />} meta={<Bar w={20} h={6} r={3} tone={2} />} subtitle={<Bar w={w} h={6} r={3} tone={2} />} />
              ))}
            </div>
          </Window>
          <div className="cc-chip" data-on={s.on || undefined}>
            <Facepile names={['Ana Ruiz', 'Jon Park', 'Leo Sato']} size={20} overlap={3} />
            <Text className="cc-chip__text">3 agents online</Text>
          </div>
        </>
      )}
    </Stage>
  )
}
