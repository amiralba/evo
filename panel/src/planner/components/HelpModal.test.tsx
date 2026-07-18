import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { HelpModal } from './HelpModal'

afterEach(cleanup)

describe('HelpModal', () => {
  it('renders the section headings and closes on Kapat', () => {
    const onClose = vi.fn()
    render(<HelpModal onClose={onClose} />)

    expect(screen.getByText(/Genel düzen/)).toBeTruthy()
    expect(screen.getByText(/Sol şerit/)).toBeTruthy()
    expect(screen.getAllByText(/Takvim/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Kapat'))
    expect(onClose).toHaveBeenCalled()
  })
})
