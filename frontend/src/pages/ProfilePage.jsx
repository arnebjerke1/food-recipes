import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'
import RecipeCard from '../components/RecipeCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'

export default function ProfilePage() {
  const { user, logout, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [bio, setBio] = useState(user?.bio || '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchMyRecipes()
  }, [])

  const fetchMyRecipes = async () => {
    setLoading(true)
    try {
      const res = await api.get('/recipes')
      setRecipes(res.data)
    } catch {
      setRecipes([])
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      await updateProfile({ bio, avatar_url: avatarUrl })
      setEditing(false)
    } catch {}
    finally { setSaving(false) }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="pb-24 min-h-screen">
      <div className="sticky top-0 bg-white border-b border-gray-100 safe-area-pt z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <button onClick={handleLogout} className="btn-ghost text-sm text-red-500">
            Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Avatar & name */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-brand-100 flex items-center justify-center overflow-hidden shrink-0 text-3xl">
            {user?.avatar_url
              ? <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" onError={(e) => (e.target.style.display = 'none')} />
              : '👤'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900">@{user?.username}</h2>
            <p className="text-gray-500 text-sm">{user?.email}</p>
            {!editing && user?.bio && <p className="text-gray-600 text-sm mt-1">{user.bio}</p>}
          </div>
          <button
            className="btn-secondary text-sm"
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {/* Edit form */}
        {editing && (
          <div className="card p-4 mb-6 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <textarea
                className="input min-h-[80px] resize-none"
                placeholder="Tell people about yourself..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Avatar URL</label>
              <input
                type="url"
                className="input"
                placeholder="https://..."
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              />
            </div>
            <button className="btn-primary w-full" onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-3 mb-6">
          <div className="card flex-1 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{recipes.length}</p>
            <p className="text-xs text-gray-400">Recipes</p>
          </div>
        </div>

        {/* Recipes */}
        <h3 className="font-semibold text-gray-700 mb-3">My Recipes</h3>
        {loading ? (
          <LoadingSpinner />
        ) : recipes.length === 0 ? (
          <EmptyState
            icon="👨‍🍳"
            title="No recipes yet"
            message="Start adding recipes to your cookbook"
            action={<button className="btn-primary" onClick={() => navigate('/add')}>Add Recipe</button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {recipes.map((r) => <RecipeCard key={r.id} recipe={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
