import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../../i18n'
import { VisitBlock } from './VisitBlock'

afterEach(cleanup)

describe('VisitBlock', () => {
  it('renders the done-outcome color class and a check-in tooltip for a realized past visit', () => {
    render(
      <VisitBlock
        storeName="Test Store"
        startMin={540}
        durationMin={30}
        dayStartMinutes={540}
        isPatch={false}
        readOnly
        status={2}
        checkInAt="2026-07-10T09:05:00Z"
        actualMinutes={35}
      />,
    )

    const block = screen.getByText('Test Store').closest('.vblock')
    expect(block?.className).toContain('outcome-done')
    expect(block?.getAttribute('title')).toContain('gerçekleşen')
  })

  it('falls back to the default category class when no status is present (future visit)', () => {
    render(
      <VisitBlock storeName="Future Store" startMin={540} durationMin={30} dayStartMinutes={540} isPatch={false} readOnly={false} />,
    )

    const block = screen.getByText('Future Store').closest('.vblock')
    expect(block?.className).toContain('catS')
    expect(block?.className).not.toContain('outcome-')
  })
})
