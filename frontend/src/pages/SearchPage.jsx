import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import RecipeCard from '../components/RecipeCard'
import LoadingSpinner from '../components/LoadingSpinner'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('recipes') // 'recipes' | 'users'
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(() => doSearch(), 400)
    return () => clearTimeout(timer)
  }, [query, mode])

  const doSearch = async () => {
    setLoading(true)
    try {
      const endpoint = mode === 'users' ? `/users?q=${encodeURIComponent(query)}` : `/recipes/search?q=${encodeURIComponent(query)}`
      const res = await api.get(endpoint)
      setResults(res.data)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pb-24 min-h-screen">
      <div className="sticky top-0 bg-white border-b border-gray-100 safe-area-pt z-10">
        <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
          <h1 className="text-2xl font-bold text-gray-900">Search</h1>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              className="input pl-10"
              placeholder={mode === 'users' ? 'Search by username…' : 'Search recipes…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            {['recipes', 'users'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setResults([]) }}
                className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors capitalize ${
                  mode === m ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {loading ? (
          <LoadingSpinner />
        ) : results.length === 0 && query ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-medium">No {mode} found for "{query}"</p>
          </div>
        ) : mode === 'recipes' ? (
          <div className="grid grid-cols-1 gap-4">
            {results.map((r) => <RecipeCard key={r.id} recipe={r} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((u) => (
              <button
                key={u.id}
                className="card w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
                onClick={() => navigate(`/user/${u.username}`)}
              >
                <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-2xl shrink-0">
                  {u.avatar_url ? <img src={u.avatar_url} alt={u.username} className="w-12 h-12 rounded-full object-cover" /> : '👤'}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">@{u.username}</p>
                  {u.bio && <p className="text-gray-500 text-sm line-clamp-1">{u.bio}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
