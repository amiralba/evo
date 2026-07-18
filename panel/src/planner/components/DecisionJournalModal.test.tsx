import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { DecisionJournalModal } from './DecisionJournalModal'
import * as queries from '../api/queries'

vi.mock('../api/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/queries')>()
  return { ...actual, useDecisionJournal: vi.fn() }
})

afterEach(cleanup)

describe('DecisionJournalModal', () => {
  it('renders an entry with its kind label, reason, objective, and error count', () => {
     
    vi.mocked(queries.useDecisionJournal).mockReturnValue({
      data: {
        items: [
          {
            id: 'j1',
            kind: 'PublishOverride',
            description: 'Published SEED-001 with 2 unresolved error(s).',
            reason: 'Merchandiser sick, coverage needed',
            objective: 'Ciroyu koru',
            errorsJson: '["V14","V14"]',
            createdAt: '2026-07-18T10:00:00Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<DecisionJournalModal onClose={() => {}} />)

    expect(screen.getByText(/📤 Yayın/)).toBeTruthy()
    expect(screen.getByText(/Merchandiser sick, coverage needed/)).toBeTruthy()
    expect(screen.getByText(/Ciroyu koru/)).toBeTruthy()
    expect(screen.getByText(/2 hata gerekçeyle geçildi/)).toBeTruthy()
  })

  it('shows the empty state when there are no entries', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(queries.useDecisionJournal).mockReturnValue({ data: { items: [] }, isLoading: false, isError: false } as any)
    render(<DecisionJournalModal onClose={() => {}} />)
    expect(screen.getByText(/Henüz kayıtlı karar yok/)).toBeTruthy()
  })
})
