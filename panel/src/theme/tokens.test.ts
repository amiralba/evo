import { describe, expect, it } from 'vitest'
import { colors } from './tokens'
import plannerCss from '../planner/planner.css?raw'

/**
 * Drift guard (gap-matrix §7 "the classic drift seam"): the palette lives in two places —
 * this file (JS, for inline styles / Recharts / MapLibre paint expressions, which can't
 * consume CSS custom properties) and planner.css's `.planner-root { --* }` block (CSS, for
 * the cascade/pseudo-states tokens.ts can't express). A real single source isn't feasible
 * while MapLibre needs literal color strings, so instead this test makes any divergence a
 * failing test rather than a silent visual bug.
 */
const CSS_VAR_TO_TOKEN_KEY: Record<string, keyof typeof colors> = {
  '--bg': 'bg',
  '--card': 'card',
  '--border': 'border',
  '--border2': 'border2',
  '--tx': 'text',
  '--tx2': 'text2',
  '--tx3': 'text3',
  '--blue': 'blue',
  '--blue-d': 'blueDark',
  '--blue-l': 'blueLight',
  '--teal': 'teal',
  '--teal-d': 'tealDark',
  '--teal-l': 'tealLight',
  '--amber': 'amber',
  '--amber-d': 'amberDark',
  '--amber-l': 'amberLight',
  '--red': 'red',
  '--red-d': 'redDark',
  '--red-l': 'redLight',
  '--green': 'green',
  '--green-l': 'greenLight',
  '--gray-l': 'grayLight',
  '--gray-m': 'grayMid',
}

function readPlannerCssVars(): Record<string, string> {
  const rootBlock = plannerCss.match(/\.planner-root\s*\{([^}]*)\}/)?.[1] ?? ''
  const vars: Record<string, string> = {}
  for (const match of rootBlock.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    vars[match[1]] = match[2].toLowerCase()
  }
  return vars
}

describe('theme/tokens.ts vs planner.css --* vars', () => {
  const cssVars = readPlannerCssVars()

  it('planner.css actually has custom properties to compare (guards against a broken regex)', () => {
    expect(Object.keys(cssVars).length).toBeGreaterThan(15)
  })

  it.each(Object.entries(CSS_VAR_TO_TOKEN_KEY))('%s matches colors.%s', (cssVar, tokenKey) => {
    const cssValue = cssVars[cssVar]
    const tokenValue = colors[tokenKey].toLowerCase()
    expect(cssValue, `${cssVar} in planner.css`).toBeDefined()
    expect(cssValue).toBe(tokenValue)
  })
})
