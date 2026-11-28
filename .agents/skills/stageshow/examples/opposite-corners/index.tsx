import { Bubble, Stage, Text, Thread, type Act } from '../../kit'
import './corners.css'

type S = { n: number }

const MESSAGES = [
  { from: 'them', text: 'Is the Lisbon offsite still on?' },
  { from: 'me', text: 'Yes, flights are booked' },
  { from: 'them', text: 'Perfect, sending the agenda now' },
]

async function script(a: Act<S>) {
  await a.wait(500)
  for (let i = 1; i <= MESSAGES.length; i++) {
    a.put({ n: i })
    await a.wait(700)
  }
  await a.wait(2000)
}

export default function OppositeCorners() {
  return (
    <Stage width={400} height={400} compact={{ below: 400, width: 358, height: 358 }} initial={{ n: 0 }} poster={{ n: MESSAGES.length }} script={script} play="once" className="oc">
      {(s) => (
        <>
          <div className="oc-art">
            <Thread>
              {MESSAGES.slice(0, s.n).map((m) => (
                <Bubble key={m.text} from={m.from as 'me' | 'them'}>
                  {m.text}
                </Bubble>
              ))}
            </Thread>
          </div>
          <div className="oc-copy">
            <Text className="oc-title">Replies in one place</Text>
            <Text className="oc-line">Every channel lands in one inbox, threaded.</Text>
          </div>
        </>
      )}
    </Stage>
  )
}
