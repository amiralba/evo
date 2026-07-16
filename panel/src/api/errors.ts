export interface ApiError {
  code: string
  title: string
  detail?: string
  userTitle: string
  userMessage: string
  status: number
  traceId?: string
  errors?: Record<string, string[]>
}

const FALLBACK: Omit<ApiError, 'status'> = {
  code: 'internal_error',
  title: 'Unexpected error',
  userTitle: 'Beklenmeyen hata',
  userMessage: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
}

/** Parses the unified application/problem+json error body (spec 003). Never throws. */
export async function parseApiError(response: Response): Promise<ApiError> {
  try {
    const body = await response.json()
    return {
      code: typeof body.code === 'string' ? body.code : FALLBACK.code,
      title: typeof body.title === 'string' ? body.title : FALLBACK.title,
      detail: typeof body.detail === 'string' ? body.detail : undefined,
      userTitle: typeof body.userTitle === 'string' ? body.userTitle : FALLBACK.userTitle,
      userMessage: typeof body.userMessage === 'string' ? body.userMessage : FALLBACK.userMessage,
      status: response.status,
      traceId: typeof body.traceId === 'string' ? body.traceId : undefined,
      errors: typeof body.errors === 'object' && body.errors !== null ? body.errors : undefined,
    }
  } catch {
    return { ...FALLBACK, status: response.status }
  }
}
