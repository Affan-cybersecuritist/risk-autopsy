import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LoadingScreen from './LoadingScreen'

// Gates the dashboard behind a session: on mount we check for one, and we
// keep listening afterwards so a sign-out (from this tab or another) sends
// the user back to /account immediately instead of leaving a stale
// dashboard on screen.
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'checking' | 'authed'>('checking')

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) setStatus('authed')
      else navigate('/account', { replace: true })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (session) setStatus('authed')
      else navigate('/account', { replace: true })
    })

    return () => { active = false; sub.subscription.unsubscribe() }
  }, [navigate])

  if (status === 'checking') return <LoadingScreen label="Verifying your session…" />
  return <>{children}</>
}
