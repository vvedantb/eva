import { Badge, Bar, Stage, Text } from '../../kit'
import './many.css'

const COLS = 5
const ROWS = 4
const FOCUS = { col: 2, row: 1 }

const W = [[96, 64], [80, 52], [104, 70], [72, 58], [90, 46]]

export default function ManyOfOne() {
  return (
    <Stage width={640} height={360} compact={{ below: 600, width: 358, height: 360 }} className="mo">
      {() => (
        <div className="mo-grid">
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const col = i % COLS
            const row = Math.floor(i / COLS)
            const focus = col === FOCUS.col && row === FOCUS.row
            const [a, b] = W[(i * 3) % W.length]!
            return focus ? (
              <div key={i} className="mo-tile" data-focus>
                <div className="mo-thumb mo-thumb--focus">
                  <span className="mo-thumb__head" />
                  <span className="mo-thumb__line" />
                  <span className="mo-thumb__line mo-thumb__line--short" />
                </div>
                <div className="mo-meta">
                  <Text className="mo-branch">pricing-copy</Text>
                  <Badge tone="success" dot>Ready</Badge>
                </div>
                <Text className="mo-commit">New annual plan wording</Text>
              </div>
            ) : (
              <div key={i} className="mo-tile">
                <div className="mo-thumb" />
                <div className="mo-meta">
                  <Bar w={a} h={8} r={4} tone={3} />
                  <Bar w={34} h={8} r={4} tone={2} />
                </div>
                <Bar w={b} h={7} r={3.5} tone={2} />
              </div>
            )
          })}
        </div>
      )}
    </Stage>
  )
}
