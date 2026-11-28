import { Badge, Bar, Row, Stage, Text, Window } from '../../kit'
import './fade.css'

const ROWS = [
  { status: 'Ready', branch: 'main', commit: 'Fix checkout redirect loop', age: '2m ago', tone: 'success' as const },
  { status: 'Ready', branch: 'pricing-copy', commit: 'New annual plan wording', age: '1h ago', tone: 'success' as const },
]

const FILL = [
  [132, 168],
  [96, 140],
  [148, 120],
  [110, 176],
]

export default function FadeCrop() {
  return (
    <Stage width={640} height={360} compact={{ below: 600, width: 358, height: 360 }} className="fc">
      {() => (
        <div className="fc-mask">
          <Window url="deploy.northwind.co" className="fc-win">
            <div className="fc-body">
              <div className="fc-head">
                <Text className="fc-title">Deployments</Text>
                <Bar w={84} h={22} r={6} tone={1} />
              </div>
              <div className="fc-list">
                {ROWS.map((r) => (
                  <Row key={r.commit} pad={0} className="fc-row" lead={<Badge tone={r.tone} dot>{r.status}</Badge>} title={<Text className="fc-commit">{r.commit}</Text>} subtitle={<Text className="fc-branch">{r.branch}</Text>} meta={<Text className="fc-age">{r.age}</Text>} />
                ))}
                {FILL.map(([a, b], i) => (
                  <Row key={i} pad={0} className="fc-row" lead={<Bar w={52} h={20} r={10} tone={1} />} title={<Bar w={a} h={8} r={4} tone={3} />} subtitle={<Bar w={b * 0.5} h={7} r={3.5} tone={2} />} meta={<Bar w={40} h={7} r={3.5} tone={2} />} />
                ))}
              </div>
            </div>
          </Window>
        </div>
      )}
    </Stage>
  )
}
