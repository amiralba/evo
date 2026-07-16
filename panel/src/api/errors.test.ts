import { describe, expect, it } from 'vitest'
import { parseApiError } from './errors'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('parseApiError', () => {
  it('parses a validation error body including userTitle/userMessage/errors', async () => {
    const response = jsonResponse(
      {
        type: 'about:blank',
        title: 'One or more validation errors occurred.',
        status: 422,
        code: 'validation_error',
        userTitle: 'Geçersiz bilgi',
        userMessage: 'Girdiğiniz bilgilerde bir sorun var.',
        errors: { email: ['Required.'] },
        traceId: 'abc-123',
      },
      422,
    )

    const result = await parseApiError(response)

    expect(result).toEqual({
      code: 'validation_error',
      title: 'One or more validation errors occurred.',
      detail: undefined,
      userTitle: 'Geçersiz bilgi',
      userMessage: 'Girdiğiniz bilgilerde bir sorun var.',
      status: 422,
      traceId: 'abc-123',
      errors: { email: ['Required.'] },
    })
  })

  it('falls back to a generic Turkish error for a non-JSON body', async () => {
    const response = new Response('not json', { status: 500 })

    const result = await parseApiError(response)

    expect(result.code).toBe('internal_error')
    expect(result.status).toBe(500)
    expect(result.userMessage).toBe('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.')
  })
})
