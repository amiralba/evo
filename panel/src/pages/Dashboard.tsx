import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getHealth } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export function Dashboard() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const { user, logout } = useAuth()

  useEffect(() => {
    getHealth()
      .then((health) => setStatus(health.status === 'ok' ? 'ok' : 'error'))
      .catch(() => setStatus('error'))
  }, [])

  return (
    <section id="center">
      <h1>EVO</h1>
      {user && <p>Merhaba, {user.displayName}</p>}
      <p data-testid="status-badge" className={`status-badge status-${status}`}>
        Backend: {status}
      </p>
      <p>
        <Link to="/planner">Planlama</Link>
      </p>
      <button type="button" onClick={() => logout()}>
        Çıkış
      </button>
    </section>
  )
}
