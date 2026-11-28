import { createContext, useContext } from 'react'

/** glass: frosted, translucent surfaces over a soft color field. */
export type Theme = 'light' | 'dark' | 'blueprint' | 'glass'
export type Palette = 'accent' | 'mono'
/** minimal: no text, only shapes. standard: real text where it carries meaning. realistic: real text, logos and avatars everywhere. */
export type Fidelity = 'minimal' | 'standard' | 'realistic'
/** wide: the design size. compact: the smaller design used below `compact.below`. */
export type Layout = 'wide' | 'compact'

export type Look = { theme: Theme; palette: Palette; fidelity: Fidelity; layout: Layout }

export const LookContext = createContext<Look>({
  theme: 'light',
  palette: 'accent',
  fidelity: 'standard',
  layout: 'wide',
})
export const useLook = () => useContext(LookContext)
