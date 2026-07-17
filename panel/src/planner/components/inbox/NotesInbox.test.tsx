import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { NotesInbox } from './NotesInbox'
import * as queries from '../../api/queries'
import * as mutations from '../../api/mutations'

vi.mock('../../api/queries', () => ({ useNotes: vi.fn() }))
vi.mock('../../api/mutations', () => ({ useUpdateNoteStatus: vi.fn() }))

afterEach(cleanup)

describe('NotesInbox', () => {
  it('renders an open note and calls the update mutation with Resolved on click', () => {
    vi.mocked(queries.useNotes).mockReturnValue({
      data: [
        {
          id: 'note-1', authorId: null, authorName: null, anchorType: 4, anchorId: null, anchorLabel: null,
          kind: 1, body: 'Mağaza müdürü perşembe servis istemiyor.', status: 1, createdAt: '2026-07-10T09:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const mutate = vi.fn()
    vi.mocked(mutations.useUpdateNoteStatus).mockReturnValue({ mutate, isPending: false } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    render(<NotesInbox onClose={() => {}} />)

    expect(screen.getByText(/perşembe servis istemiyor/)).toBeTruthy()

    screen.getByText('Çözüldü').click()

    expect(mutate).toHaveBeenCalledWith({ id: 'note-1', body: { status: 3 } })
  })

  it('shows the empty state when there are no open notes', () => {
    vi.mocked(queries.useNotes).mockReturnValue({ data: [], isLoading: false, isError: false } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    vi.mocked(mutations.useUpdateNoteStatus).mockReturnValue({ mutate: vi.fn(), isPending: false } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    render(<NotesInbox onClose={() => {}} />)

    expect(screen.getByText(/Açık not yok/)).toBeTruthy()
  })
})
