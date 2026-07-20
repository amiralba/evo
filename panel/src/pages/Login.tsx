import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoginError, useAuth } from '../auth/AuthContext'
import { EvoLogo } from '../components/EvoLogo'
import './pages.css'

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
    <div className="auth">
      <aside className="auth__brand">
        <div className="auth__brand-top">
          <EvoLogo size={38} />
          <span>EVO</span>
        </div>

        <div className="auth__brand-mid">
          <h2 className="auth__headline">Saha ekipleriniz için akıllı rota planlama</h2>
          <p className="auth__sub">
            Mağazaları, ziyaret sıklıklarını ve görevleri tek ekranda tasarlayın; değişiklikleri
            yayınlamadan önce önizleyin.
          </p>
          <ul className="auth__features">
            <li>
              <span className="auth__check">✓</span> Sürükle-bırak takvim ve harita
            </li>
            <li>
              <span className="auth__check">✓</span> Taslak → Yayınla iş akışı
            </li>
            <li>
              <span className="auth__check">✓</span> Kural tabanlı ziyaret süreleri
            </li>
          </ul>
        </div>

        <div className="auth__brand-foot">Merchandising Rota Planlama Aracı</div>
      </aside>

      <main className="auth__panel">
        <form className="auth__card" onSubmit={handleSubmit}>
          <h1>Tekrar hoş geldiniz</h1>
          <p className="auth__lead">Devam etmek için hesabınıza giriş yapın.</p>

          {error && (
            <p className="auth__error" role="alert">
              <span aria-hidden="true">⚠</span>
              {error}
            </p>
          )}

          <div className="field">
            <label htmlFor="email">E-posta</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              placeholder="ad@evo.local"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Parola</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>

          {/* Dev-only convenience — NEVER render seed credentials in a production build. */}
          {import.meta.env.DEV && (
            <p className="auth__hint">
              Demo girişi: <code>admin@evo.local</code> / <code>Demo1234!</code>
            </p>
          )}
        </form>
      </main>
    </div>
  )
}
