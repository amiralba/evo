/**
 * Design tokens extracted from evo-planner-prototype-v0.5.html (`:root{...}` block, line 68,
 * plus semantic color usage across the file — badge/severity/mix classes, spacing and
 * font-size literals). The prototype is the UX reference (CLAUDE.md); do not invent new
 * values here — extend from the prototype's actual CSS as more of it gets ported.
 */

export const colors = {
  // Base surface + text (prototype :root, line 68-70)
  bg: '#FAFAF7',
  card: '#FFFFFF',
  border: '#E3E1D9',
  border2: '#CBC9BF',
  text: '#2C2C2A',
  text2: '#6B6A64',
  text3: '#98968D',

  // Brand / accent hues (prototype :root, line 71-76) — each has base/dark/light variant
  blue: '#378ADD',
  blueDark: '#185FA5',
  blueLight: '#E6F1FB',
  teal: '#1D9E75',
  tealDark: '#0F6E56',
  tealLight: '#E1F5EE',
  amber: '#EF9F27',
  amberDark: '#854F0B',
  amberLight: '#FAEEDA',
  red: '#E24B4A',
  redDark: '#A32D2D',
  redLight: '#FCEBEB',
  green: '#639922',
  greenLight: '#EAF3DE',
  grayLight: '#F1EFE8',
  grayMid: '#B4B2A9',
} as const

/**
 * Validation severity (design doc §"Doğrulama motoru" / prototype line 1985-1986):
 * err = hard-impossible, blocks nothing but requires override reason; warn = allowed but
 * suboptimal; info = worth a look. Rendered in the prototype as 🔴/🟡/🔵.
 */
export const severityColors = {
  err: { fg: colors.redDark, bg: colors.redLight },
  warn: { fg: colors.amberDark, bg: colors.amberLight },
  info: { fg: colors.blueDark, bg: colors.blueLight },
} as const

/**
 * Store category badge (`.badge.P/.V/.S`, prototype line 168-170) — P/V/S is the store's
 * planlanan/variable/sabit visit-mix classification, shown as 🟢/🟡/⚪ in "Karışım" (mix).
 */
export const categoryColors = {
  P: { fg: colors.tealDark, bg: colors.tealLight },
  V: { fg: colors.amberDark, bg: colors.amberLight },
  S: { fg: colors.text2, bg: colors.grayLight },
} as const

/** day-total load bar states (`.day-total.ok/.over/.under`, prototype line 137-139) */
export const loadStatusColors = {
  ok: colors.green,
  over: colors.red,
  under: colors.amberDark,
} as const

/**
 * Spacing scale — the discrete padding/margin/gap px values actually used across the
 * prototype's inline CSS, deduplicated and named.
 */
export const spacing = {
  xxs: '2px',
  xs: '3px',
  sm: '4px',
  smd: '5px',
  md: '6px',
  lg: '8px',
  xl: '10px',
  xxl: '12px',
  xxxl: '14px',
} as const

/** border-radius scale (prototype's most common radii: 4/5/6/8px controls, 10/12/14px cards/popovers) */
export const radius = {
  sm: '4px',
  md: '5px',
  lg: '6px',
  xl: '8px',
  pill: '12px',
  card: '10px',
} as const

/**
 * Typography scale — prototype base font-size is 13px (body, line 79); most UI chrome
 * (labels, meta text, table cells) runs 10-12px; headings/emphasis use 14-15px.
 */
export const fontSize = {
  xs: '9px',
  sm: '10px',
  smd: '10.5px',
  md: '11px',
  mdl: '11.5px',
  lg: '12px',
  base: '13px',
  xl: '14px',
  xxl: '15px',
} as const

export const fontFamily = "-apple-system, 'Segoe UI', Roboto, sans-serif"

export const tokens = {
  colors,
  severityColors,
  categoryColors,
  loadStatusColors,
  spacing,
  radius,
  fontSize,
  fontFamily,
} as const
