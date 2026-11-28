import { Check as Tick, ChevronDown, FileText, Lock } from 'lucide-react'
import { Avatar, Bar, Collapse, Facepile, Field, Menu, Popover, Roll, Row, Stage, Text, Window, type Act, type Layout } from '../../kit'
import './share.css'

type S = {
  open: boolean
  email: string
  typing: boolean
  chip: boolean
  menu: boolean
  role: string
  hover: number | undefined
  added: boolean
}

const initial: S = { open: false, email: '', typing: false, chip: false, menu: false, role: 'Can view', hover: undefined, added: false }

const poster: S = { ...initial, open: true, added: true }

const DOC = 'Launch brief'
const EMAIL = 'priya@lumen.co'
const ROLES = ['Can view', 'Can comment', 'Can edit']
const EDIT = ROLES.indexOf('Can edit')

async function script(a: Act<S>) {
  await a.wait(600)

  a.mark('open')
  await a.click({ at: 'share', x: 0.5, y: 0.55 })
  await a.set({ open: true })
  await a.wait(700)

  a.mark('type')
  await a.click({ at: 'field', x: 0.3, y: 0.5 })
  await a.set({ typing: true })
  await a.type('email', EMAIL, { interval: 55 })
  await a.set({ typing: false })
  await a.wait(250)
  await a.key('enter')
  await a.set({ chip: true })
  await a.wait(600)

  a.mark('role')
  await a.click({ at: 'role', x: 0.45, y: 0.5 })
  await a.set({ menu: true })
  await a.wait(450)
  await a.move({ at: `role-${EDIT}`, x: 0.4, y: 0.55 })
  await a.wait(300)
  await a.click()
  await a.set({ menu: false, role: 'Can edit' })
  await a.wait(500)

  a.mark('invite')
  await a.click({ at: 'invite', x: 0.5, y: 0.55 })
  await a.set({ added: true })
  await a.wait(350)
  await a.set({ chip: false, email: '', role: 'Can view' })
  await a.wait(1850)

  a.mark('close')
  await a.click({ at: 'share', x: 0.5, y: 0.55 })
  await a.set({ open: false })
  await a.wait(450)
  await a.snap({ added: false })
  await a.wait(500)
}

type Geo = { win: { x: number; y: number; w: number; h: number }; pop: number }

const GEO: Record<Layout, Geo> = {
  wide: { win: { x: 24, y: 24, w: 432, h: 360 }, pop: 344 },
  compact: { win: { x: 16, y: 20, w: 326, h: 400 }, pop: 310 },
}

export default function ShareDemo() {
  return (
    <Stage<S>
      width={480}
      height={340}
      compact={{ below: 440, width: 358, height: 380 }}
      initial={initial}
      poster={poster}
      script={script}
      keys={{ wide: 'bottom-left', compact: 'bottom-left' }}
      cursor={{ at: { at: 'doc', x: 0.3, y: 0.6 } }}
      className="sh"
    >
      {(s, rect, layout) => {
        const g = GEO[layout]
        const share = rect('share')
        const pop = { left: share.x + share.width - g.pop, top: share.y + share.height + 8, width: g.pop }
        return (
          <>
            <Window
              className="sh-window"
              style={{ left: g.win.x, top: g.win.y, width: g.win.w, height: g.win.h }}
              lead={
                <span className="sh-lead">
                  <FileText size={15} strokeWidth={1.75} />
                  <span>{DOC}</span>
                </span>
              }
              toolbar={
                <span className="sh-tools">
                  <Facepile names={['Maya Chen', 'Leo Park']} size={22} overlap={3} />
                  <span className="sh-share" data-target="share" data-cursor="pointer" data-on={s.open || undefined}>
                    <Lock size={12} strokeWidth={2.25} />
                    Share
                  </span>
                </span>
              }
              body={{ className: 'sh-body', 'data-crop': true }}
            >
              <div className="sh-doc" data-target="doc">
                <Bar w={180} h={12} tone={3} className="sh-doc__title" />
                <Bar w={300} h={7} tone={2} />
                <Bar w={340} h={7} tone={2} />
                <Bar w={250} h={7} tone={2} />
                <span className="sh-doc__gap" />
                <Bar w={320} h={7} tone={2} />
                <Bar w={280} h={7} tone={2} />
              </div>
            </Window>

            <Popover show={s.open} origin="top right" className="sh-pop" style={pop}>
              <div className="sh-pop__head">
                <Text className="sh-pop__title">{`Share “${DOC}”`}</Text>
              </div>
              <div className="sh-invite">
                <Field
                  className="sh-field"
                  value={s.email}
                  chip={s.chip}
                  focused={s.open && !s.added && !s.menu}
                  placeholder={layout === 'wide' ? 'Add people by email' : 'Add by email'}
                  box={{ 'data-target': 'field' }}
                  trailing={
                    <span className="sh-role">
                      <span className="sh-role__hit" data-target="role" data-cursor="pointer" data-on={s.menu || undefined}>
                        <Roll variant="fade" align="end">{s.role}</Roll>
                        <ChevronDown size={12} strokeWidth={2.25} />
                      </span>
                    </span>
                  }
                />
                <span className="sh-invite__btn" data-target="invite" data-cursor="pointer" data-ready={s.chip || undefined}>
                  Invite
                </span>
              </div>
              <div className="sh-access">
                <div className="sh-access__label">People with access</div>
                <div className="sh-people">
                  <Collapse open={s.added} reveal="drop">
                    <Person name="Priya Shah" email={EMAIL} role="Can edit" />
                  </Collapse>
                  <Person name="Maya Chen" email="maya@lumen.co" role="Owner" />
                  <Person name="Leo Park" email="leo@lumen.co" role="Can view" />
                </div>
              </div>
              <Popover show={s.menu} origin="top left" className="sh-menu" style={roleMenu(rect, pop)}>
                <Menu
                  items={ROLES.map((r) => (
                    <span className="sh-menu__item" key={r}>
                      <span className="sh-menu__tick">{r === s.role && <Tick size={12} strokeWidth={2.5} />}</span>
                      {r}
                    </span>
                  ))}
                  targets={ROLES.map((_, i) => `role-${i}`)}
                />
              </Popover>
            </Popover>
          </>
        )
      }}
    </Stage>
  )
}

function roleMenu(rect: (name: string) => { x: number; y: number; width: number; height: number }, pop: { left: number; top: number; width: number }) {
  const r = rect('role')
  const f = rect('field')
  const left = r.x - pop.left - 4
  return { left, top: f.y - pop.top + f.height + 6, width: pop.width - 10 - left }
}

function Person({ name, email, role }: { name: string; email: string; role: string }) {
  return <Row className="sh-person" pad={6} lead={<Avatar name={name} size={28} />} title={name} subtitle={email} meta={<span className="sh-person__role">{role}</span>} />
}
