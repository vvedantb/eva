import type { HTMLAttributes, ReactNode } from 'react'
import { useLook } from './looks'
import './window.css'

export interface WindowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  url?: ReactNode
  urlShape?: 'rounded' | 'pill'
  tabs?: ReactNode[]
  nav?: boolean
  title?: string
  sidebar?: ReactNode
  sidebarWidth?: number
  sidebarStyle?: 'flush' | 'floating'
  toolbar?: ReactNode
  lead?: ReactNode
  body?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, unknown>
  receded?: boolean
  chrome?: 'native' | 'glass' | 'terminal' | 'card' | 'hairline'
  lights?: 'color' | 'grey' | 'white'
  lightsSize?: 'standard' | 'large'
  barSize?: 'standard' | 'tall'
  children?: ReactNode
}

function Lights() {
  return (
    <span className="ss-window__lights">
      <span className="ss-window__dot" />
      <span className="ss-window__dot" />
      <span className="ss-window__dot" />
    </span>
  )
}

function Lock() {
  return (
    <svg className="ss-window__lock" width="7" height="8" viewBox="0 0 7 8" aria-hidden>
      <path d="M1.5 3.3V2.4a2 2 0 0 1 4 0v.9" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <rect x="0" y="3.3" width="7" height="4.7" rx="1.2" fill="currentColor" />
    </svg>
  )
}

function Chevron({ back }: { back?: boolean }) {
  return (
    <svg className="ss-window__chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d={back ? 'M6.5 1.5 3 5l3.5 3.5' : 'M3.5 1.5 7 5 3.5 8.5'} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Window chrome. Three kinds, chosen by props:
 * - browser (`url`): address bar, optional `nav` arrows and `tabs` strip
 * - app (`title`): a plain title bar with a centered title
 * - sidebar app (`sidebar`): the sidebar runs to the top and holds the lights; the content column gets its own toolbar
 */
export function Window({ url, urlShape, tabs, nav, title, sidebar, sidebarWidth = 180, sidebarStyle, toolbar, lead, body, className, receded, chrome, lights, lightsSize, barSize, children, ...rest }: WindowProps) {
  const cls = `ss-window ss-recede${className ? ` ${className}` : ''}`
  const large = lightsSize === 'large' ? 'large' : undefined
  const tall = barSize === 'tall' ? 'tall' : undefined

  if (chrome === 'terminal') {
    return (
      <div {...rest} className={cls} data-chrome="terminal" data-lights={lights === 'grey' ? 'grey' : undefined} data-lights-size={large} data-receded={receded || undefined}>
        <div className="ss-window__bar">
          <Lights />
          {title !== undefined && <span className="ss-term__title">{title}</span>}
        </div>
        <div {...body} className={`ss-window__body ss-term${body?.className ? ` ${body.className}` : ''}`}>{children}</div>
      </div>
    )
  }

  if (chrome === 'glass' || chrome === 'card' || chrome === 'hairline') {
    return (
      <div {...rest} className={cls} data-chrome={chrome} data-lights={lights === 'color' || lights === 'white' ? lights : chrome === 'glass' ? 'grey' : undefined} data-receded={receded || undefined}>
        <div className="ss-window__bar">
          <Lights />
          {url !== undefined && (
            <span className="ss-window__url">
              {chrome === 'glass' && <Lock />}
              <span className="ss-window__url-text">{url}</span>
            </span>
          )}
          <span className="ss-window__end">{toolbar}</span>
        </div>
        <div {...body} className={`ss-window__body${body?.className ? ` ${body.className}` : ''}`}>{children}</div>
      </div>
    )
  }

  const address = url !== undefined && (
    <>
      {nav && (
        <span className="ss-window__nav">
          <Chevron back />
          <Chevron />
        </span>
      )}
      <span className="ss-window__url">{url}</span>
    </>
  )

  if (sidebar !== undefined) {
    return (
      <div {...rest} className={cls} data-kind="sidebar" data-side={sidebarStyle === 'floating' ? 'floating' : undefined} data-lights={lights === 'grey' ? 'grey' : undefined} data-lights-size={large} data-bar={tall} data-receded={receded || undefined} data-url-shape={urlShape}>
        <aside className="ss-window__side" style={{ width: sidebarWidth }}>
          <div className="ss-window__side-top">
            <Lights />
          </div>
          {sidebar}
        </aside>
        <div className="ss-window__main">
          <div className="ss-window__bar">
            {title !== undefined && <span className="ss-window__heading">{title}</span>}
            {lead}
            {address}
            <span className="ss-window__spacer" />
            {toolbar}
          </div>
          <div {...body} className={`ss-window__body${body?.className ? ` ${body.className}` : ''}`}>{children}</div>
        </div>
      </div>
    )
  }

  if (tabs?.length) {
    return (
      <div {...rest} className={cls} data-kind="tabs" data-lights={lights === 'grey' ? 'grey' : undefined} data-lights-size={large} data-receded={receded || undefined} data-url-shape={urlShape}>
        <div className="ss-window__tabs">
          <Lights />
          {tabs.map((t, i) => (
            <span key={i} className="ss-window__tab" data-active={i === 0 || undefined}>
              <span className="ss-window__favicon" />
              <span className="ss-window__tab-label">{t}</span>
            </span>
          ))}
        </div>
        <div className="ss-window__bar">
          {address}
          {toolbar}
        </div>
        <div {...body} className={`ss-window__body${body?.className ? ` ${body.className}` : ''}`}>{children}</div>
      </div>
    )
  }

  return (
    <div {...rest} className={cls} data-receded={receded || undefined} data-url-shape={urlShape} data-lights={lights === 'grey' ? 'grey' : undefined} data-lights-size={large} data-bar={tall}>
      <div className="ss-window__bar">
        <Lights />
        {address}
        {title !== undefined && <span className="ss-window__title" data-toolbar={toolbar ? true : undefined}>{title}</span>}
        {lead}
        {url === undefined && title === undefined && <span className="ss-window__spacer" />}
        {toolbar}
      </div>
      <div {...body} className={`ss-window__body${body?.className ? ` ${body.className}` : ''}`}>{children}</div>
    </div>
  )
}

const INK = ['var(--ss-ink-1)', 'var(--ss-ink-2)', 'var(--ss-ink-3)', 'var(--ss-ink-4)', 'var(--ss-ink-5)']

export interface BarProps extends HTMLAttributes<HTMLSpanElement> {
  w: number | string
  h?: number
  tone?: 1 | 2 | 3 | 4 | 5
  r?: number
  shrink?: boolean
}

/** A placeholder: a line of text, a value, an icon slot or a pill. A line
 * gives way in a narrow row as text would; where it fits, it is exactly `w`. */
export function Bar({ w, h = 6, tone = 3, r = 2, shrink, className, style, ...rest }: BarProps) {
  const gives = shrink ?? (typeof w === 'number' && w > h * 3)
  return <span {...rest} className={`ss-bar${className ? ` ${className}` : ''}`} data-shrink={gives || undefined} style={{ width: w, height: h, borderRadius: r, background: INK[tone - 1], ...style }} />
}

export interface TextProps extends HTMLAttributes<HTMLSpanElement> {
  children: string
  filler?: boolean
  w?: number
  h?: number
  tone?: BarProps['tone']
  wrap?: boolean
}

/**
 * Text that knows the stage's fidelity: real words normally, a bar of about
 * the same width in minimal. Write real copy once and every look follows.
 */
export function Text({ children, w, h = 6, tone = 3, wrap, filler, className, style, ...rest }: TextProps) {
  const { fidelity } = useLook()
  if (fidelity === 'minimal' || (filler && fidelity !== 'realistic')) {
    const size = typeof style?.fontSize === 'number' ? style.fontSize : 11
    return <Bar {...rest} w={w ?? Math.round(children.length * size * 0.52)} h={h} tone={tone} className={className} />
  }
  return (
    <span {...rest} className={`ss-text${className ? ` ${className}` : ''}`} data-wrap={wrap || undefined} style={style}>
      {children}
    </span>
  )
}

export interface PromptProps extends HTMLAttributes<HTMLDivElement> {
  path?: string
  children?: ReactNode
}

/** A terminal command line: a dim path, the prompt mark, and the command
 * bright. Recolor the path and mark with `--ss-term-path` and
 * `--ss-term-sigil` (set on the window, the stage or any parent). */
export function Prompt({ path = '~', children, className, ...rest }: PromptProps) {
  return (
    <div {...rest} className={`ss-term__line ss-term__prompt${className ? ` ${className}` : ''}`}>
      <span className="ss-term__path">{path}</span>
      <span className="ss-term__sigil">❯</span>
      <span className="ss-term__cmd">{children}</span>
    </div>
  )
}

/** A terminal's block cursor. Blinks unless `still` (while typing, a real one holds solid). */
export function Caret({ still }: { still?: boolean }) {
  return <span className="ss-term__caret" data-still={still || undefined} aria-hidden />
}
