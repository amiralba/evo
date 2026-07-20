import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getHealth } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { EvoLogo } from '../components/EvoLogo'
import './pages.css'

const STATUS_LABEL: Record<'loading' | 'ok' | 'error', string> = {
  loading: 'Bağlanıyor…',
  ok: 'Sistem çevrimiçi',
  error: 'Bağlantı yok',
}

export function Dashboard() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const { user, logout } = useAuth()

  useEffect(() => {
    getHealth()
      .then((health) => setStatus(health.status === 'ok' ? 'ok' : 'error'))
      .catch(() => setStatus('error'))
  }, [])

  const firstName = user?.displayName?.split(' ')[0] ?? ''

  return (
    <div className="home">
      <header className="home__bar">
        <div className="home__brand">
          <EvoLogo size={30} />
          <span>EVO</span>
        </div>
        <div className="home__bar-right">
          {user && (
            <span className="home__user">
              <b>{user.displayName}</b>
            </span>
          )}
          {/* data-testid + status-{state} classes kept for e2e/auth.spec.ts */}
          <span data-testid="status-badge" className={`status-pill status-badge status-${status} ${status}`}>
            <span className="dot" />
            {STATUS_LABEL[status]}
          </span>
          <button type="button" className="btn-ghost" onClick={() => logout()}>
            Çıkış
          </button>
        </div>
      </header>

      <main className="home__main">
        <section className="home__hero">
          <p className="home__eyebrow">Rota Planlama</p>
          <h1>Merhaba{firstName ? `, ${firstName}` : ''} 👋</h1>
          <p>
            Bugün ne üzerinde çalışmak istersiniz? Rotalarınızı planlayın veya sahadaki planın
            sağlığını inceleyin.
          </p>
        </section>

        <section className="home__grid">
          <Link to="/planner" className="tile">
            <span className="tile__icon blue" aria-hidden="true">
              {/* calendar / route glyph */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4.5" width="18" height="16" rx="3" stroke="#fff" strokeWidth="1.7" />
                <path d="M3 9h18M8 3v3M16 3v3" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
                <circle cx="8.5" cy="13.5" r="1.4" fill="#fff" />
                <path d="M8.5 13.5c3 0 3 3 6 3" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="14.5" cy="16.5" r="1.4" fill="#fff" />
              </svg>
            </span>
            <h3>Planlama</h3>
            <p>Mağazaları rotalara yerleştirin, takvimi düzenleyin ve değişiklikleri yayınlayın.</p>
            <span className="tile__arrow">Çalışma alanını aç →</span>
          </Link>

          <Link to="/analytics" className="tile">
            <span className="tile__icon teal" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M4 20h16" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
                <rect x="6" y="11" width="3" height="6" rx="1" fill="#fff" />
                <rect x="11" y="7" width="3" height="10" rx="1" fill="#fff" />
                <rect x="16" y="13" width="3" height="4" rx="1" fill="#fff" />
              </svg>
            </span>
            <h3>Analitik</h3>
            <p>Plan sağlığı, iş yükü dengesi ve mobilite metriklerini bölgeye göre görün.</p>
            <span className="tile__arrow">Panoları gör →</span>
          </Link>

          <div className="tile is-static">
            <span className="tile__icon gray" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3l7 3v5c0 4.2-2.8 7.5-7 9-4.2-1.5-7-4.8-7-9V6l7-3z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h3>Sistem durumu</h3>
            <p>{STATUS_LABEL[status]} — arka uç bağlantısı bu oturumda sürekli izlenir.</p>
          </div>
        </section>
      </main>

      <footer className="home__foot">EVO · Merchandising Rota Planlama Aracı</footer>
    </div>
  )
}
