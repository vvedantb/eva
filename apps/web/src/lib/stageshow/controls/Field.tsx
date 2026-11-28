"use no memo"
import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { Icon } from '../parts/Icon'
import './Field.css'

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label?: ReactNode
  value: string
  placeholder?: string
  focused?: boolean
  password?: boolean
  status?: 'valid' | 'error'
  chip?: boolean
  remove?: string
  leading?: ReactNode
  trailing?: ReactNode
  box?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, unknown>
}

/**
 * A text field: label, box, value and caret. The focus ring fades in without
 * moving the text, the placeholder leaves the moment the first character
 * lands (and fades back when emptied), and the caret sits solid while typing,
 * blinking only once it rests. Put data-target on `box`, the part a cursor clicks.
 */
export function Field({ label, value, placeholder, focused, password, status, chip, remove, leading, trailing, box, className, style, ...rest }: FieldProps) {
  const held = useRef('')
  const text = useRef<HTMLSpanElement>(null)
  const [, release] = useState(0)
  if (chip || value) held.current = chip ? value : ''
  const let_go = () => {
    if (!held.current) return
    held.current = ''
    release((n) => n + 1)
  }
  const out = !chip && !value && !!held.current
  useLayoutEffect(() => {
    const el = text.current
    if (!out || !el) return
    const check = () => {
      if (Number(getComputedStyle(el).opacity) === 0) let_go()
    }
    const settle = (event: TransitionEvent) => {
      if (event.target === el && event.propertyName === 'opacity') check()
    }
    el.addEventListener('transitionend', settle)
    el.addEventListener('transitioncancel', settle)
    check()
    return () => {
      el.removeEventListener('transitionend', settle)
      el.removeEventListener('transitioncancel', settle)
    }
  }, [out])
  const shown = out ? held.current : value
  return (
    <div {...rest} className={`ss-field${className ? ` ${className}` : ''}`} data-focused={focused || undefined} data-status={status} data-filled={value ? true : undefined} style={style}>
      {label && <span className="ss-field__label">{label}</span>}
      <div data-cursor="ibeam" {...box} className={`ss-field__box${box?.className ? ` ${box.className}` : ''}`}>
        {leading}
        <span className="ss-field__text">
          {placeholder && <span className="ss-field__placeholder">{placeholder}</span>}
          <span ref={text} className="ss-field__value" data-password={password || undefined} data-chip={chip || out || undefined} data-leaving={out || undefined} data-removable={remove !== undefined || undefined}>
            <span className="ss-field__chars">{password ? '•'.repeat(shown.length) : shown}</span>
            {remove !== undefined && (
              <span className="ss-field__x" role="button" data-cursor="hand" data-target={remove || undefined}>
                <Icon name="close" size={10} stroke={1.8} />
              </span>
            )}
          </span>
          {focused && <span key={value.length} className="ss-field__caret" />}
        </span>
        {status === 'valid' && (
          <svg className="ss-field__ok" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" pathLength={1} />
          </svg>
        )}
        {trailing}
      </div>
    </div>
  )
}
