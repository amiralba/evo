import { useEffect, useState } from 'react'
import { getHealth } from './api/client'
import './App.css'

function App() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    getHealth()
      .then((health) => setStatus(health.status === 'ok' ? 'ok' : 'error'))
      .catch(() => setStatus('error'))
  }, [])

  return (
    <section id="center">
      <h1>EVO</h1>
      <p data-testid="status-badge" className={`status-badge status-${status}`}>
        Backend: {status}
      </p>
    </section>
  )
}

export default App
