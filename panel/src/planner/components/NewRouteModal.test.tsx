import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { NewRouteModal } from './NewRouteModal'
import * as mutations from '../api/mutations'

vi.mock('../api/mutations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/mutations')>()
  return { ...actual, useCreateRoute: vi.fn() }
})

afterEach(cleanup)

describe('NewRouteModal', () => {
  it('disables Kaydet until a name is entered', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mutations.useCreateRoute).mockReturnValue({ mutate: vi.fn(), isPending: false } as any)
    render(<NewRouteModal onClose={() => {}} onCreated={() => {}} />)

    const saveButton = screen.getByText('Kaydet') as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/Rut adı/), { target: { value: 'Yeni Rota' } })
    expect(saveButton.disabled).toBe(false)
  })

  it('calls the mutation with name/province and calls onCreated with the new route id', () => {
    const mutate = vi.fn((_body, opts) => opts.onSuccess({ id: 'new-route-1' }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mutations.useCreateRoute).mockReturnValue({ mutate, isPending: false } as any)
    const onCreated = vi.fn()
    const onClose = vi.fn()

    render(<NewRouteModal onClose={onClose} onCreated={onCreated} />)
    fireEvent.change(screen.getByLabelText(/Rut adı/), { target: { value: 'Yeni Rota' } })
    fireEvent.click(screen.getByText('Kaydet'))

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Yeni Rota' }), expect.anything())
    expect(onCreated).toHaveBeenCalledWith('new-route-1')
    expect(onClose).toHaveBeenCalled()
  })
})
