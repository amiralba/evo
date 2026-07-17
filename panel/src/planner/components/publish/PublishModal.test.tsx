import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../i18n'
import { PublishModal } from './PublishModal'
import * as plannerApi from '../../../api/planner'
import * as mutations from '../../api/mutations'

vi.mock('../../../api/planner')
vi.mock('../../api/mutations', () => ({ usePublish: vi.fn() }))

afterEach(cleanup)

function mockPublish() {
  return {
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    data: undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('PublishModal', () => {
  it('disables Publish until reason+objective are filled when there is an error finding', async () => {
    vi.mocked(plannerApi.validateRoute).mockResolvedValue([
      { code: 'V3', severity: 1, message: 'out of scope', scope: 'route' },
    ])
    vi.mocked(mutations.usePublish).mockReturnValue(mockPublish())

    render(<PublishModal routeId="route-1" onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText(/Yayınla/)).toBeTruthy())
    const publishButton = screen.getByRole('button', { name: 'Yayınla' }) as HTMLButtonElement
    expect(publishButton.disabled).toBe(true)
  })

  it('enables Publish immediately when there are no error findings', async () => {
    vi.mocked(plannerApi.validateRoute).mockResolvedValue([])
    vi.mocked(mutations.usePublish).mockReturnValue(mockPublish())

    render(<PublishModal routeId="route-1" onClose={() => {}} />)

    await waitFor(() => expect(screen.getByText(/Doğrulama bulgusu yok/)).toBeTruthy())
    const publishButton = screen.getByRole('button', { name: 'Yayınla' }) as HTMLButtonElement
    expect(publishButton.disabled).toBe(false)
  })
})
