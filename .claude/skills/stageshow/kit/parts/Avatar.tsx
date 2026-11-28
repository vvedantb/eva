import type { HTMLAttributes } from 'react'
import { useLook } from '../looks'
import './Avatar.css'

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name?: string
  plain?: boolean
  size?: number
  tone?: 'accent' | 'ink' | 'success' | 'person' | 'ios'
  src?: string
  ring?: 'pending' | 'waiting' | 'confirmed' | 'declined'
}

const PEOPLE = ['#c98f6e', '#6f9b7d', '#7b86c7', '#c47a9e', '#8c9ab0', '#c2a35a']
const hue = (name: string) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 9973; return PEOPLE[h % PEOPLE.length] }

export function Avatar({ name = '', plain = false, size = 24, tone = name ? 'person' : 'ink', src, ring, className, style, ...rest }: AvatarProps) {
  const { fidelity } = useLook()
  const disc = plain || fidelity === 'minimal'
  const person = tone === 'person' && !disc ? { background: hue(name), color: '#fff' } : undefined
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = tone === 'ios' ? (words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1]![0] : '') : name.trim()[0] ?? ''
  return (
    <span
      {...rest}
      className={`ss-avatar${className ? ` ${className}` : ''}`}
      data-tone={tone}
      data-ring={ring}
      style={{ width: size, height: size, fontSize: Math.round(size * (tone === 'ios' ? 0.4 : size < 24 ? 0.5 : 0.42)), ...person, ...style }}
    >
      {src && !disc ? <img src={src} alt="" /> : disc ? null : <span className="ss-avatar__initial">{initials.toUpperCase()}</span>}
    </span>
  )
}
