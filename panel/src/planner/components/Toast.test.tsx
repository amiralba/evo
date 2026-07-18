import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toast } from './Toast'
import { toast, useToastStore } from '../state/toastStore'

afterEach(() => {
  cleanup()
  act(() => useToastStore.getState().dismiss())
})

describe('Toast', () => {
  it('renders nothing when there is no message', () => {
    render(<Toast />)
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('shows a message triggered via the toast() helper', () => {
    render(<Toast />)
    act(() => toast('Yama uygulandı'))
    expect(screen.getByTestId('toast').textContent).toContain('Yama uygulandı')
  })

  it('renders action buttons and calls both onClick and dismiss', () => {
    const onClick = vi.fn()
    render(<Toast />)
    act(() => toast('Sıra güncellendi', [{ label: 'Geri al', onClick }]))

    fireEvent.click(screen.getByText('Geri al'))

    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('toast')).toBeNull()
  })

  it('a new toast replaces the one currently showing', () => {
    render(<Toast />)
    act(() => toast('First'))
    act(() => toast('Second'))

    expect(screen.getByTestId('toast').textContent).toContain('Second')
    expect(screen.queryByText('First')).toBeNull()
  })

  it('dismisses on the ✕ button', () => {
    render(<Toast />)
    act(() => toast('Bir mesaj'))
    fireEvent.click(screen.getByLabelText('dismiss'))
    expect(screen.queryByTestId('toast')).toBeNull()
  })
})
