import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/lib/store'
import { Leaf, Eye, EyeOff } from 'lucide-react'
import { appTitle, venueName, copyrightLine, getBranding } from '@/lib/config'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuthStore()
  // подписка на бренд: он догружается асинхронно, и без неё экран входа
  // так и остался бы с нейтральной подписью до перезагрузки страницы
  useAuthStore(st => st.branding)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await signIn(username, password)
    if (err) {
      setError(err.message || 'Неверный логин или пароль')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-mint-500/10 rounded-full blur-[120px]" />

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          {getBranding().logo_url && <img src={getBranding().logo_url} alt="" className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg shadow-green-900/40" />}
          <h1 className="text-2xl font-display font-bold tracking-tight">{appTitle()}</h1>
          {venueName() && <p className="text-slate-500 text-sm mt-1">{venueName()}</p>}
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label className="label">Логин</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="input w-full"
              placeholder="username"
              autoComplete="username"
              required
              minLength={3}
            />
          </div>

          <div>
            <label className="label">Пароль</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input w-full pr-10"
                placeholder="••••"
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">{copyrightLine()}</p>
      </div>
    </div>
  )
}
