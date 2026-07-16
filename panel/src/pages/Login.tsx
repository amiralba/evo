import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoginError, useAuth } from '../auth/AuthContext'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      // LOGIN PAGE ONLY: reuses this page's own inline error element. No app-wide error
      // notification component (toast/popup/inline pattern is a deferred decision — see
      // specs/003-error-audit/spec.md Non-goals).
      setError(err instanceof LoginError ? err.apiError.userMessage : 'Beklenmeyen bir hata oluştu.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section id="login">
      <form onSubmit={handleSubmit}>
        <h1>EVO'ya Giriş Yap</h1>
        <label htmlFor="email">E-posta</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="password">Parola</label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={isSubmitting}>
          Giriş yap
        </button>
      </form>
    </section>
  )
}
