import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'
import RecipeCard from '../components/RecipeCard'
import LoadingSpinner from '../components/LoadingSpinner'

export default function UserProfilePage() {
  const { username } = useParams()
  const { user: me } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [username])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const profileRes = await api.get(`/users/${username}`)
      setProfile(profileRes.data)
      setFollowing(profileRes.data.isFollowing)
      const userRecipes = await api.get(`/recipes?userId=${profileRes.data.id}`)
      setRecipes(userRecipes.data)
    } catch {
      navigate('/search')
    } finally {
      setLoading(false)
    }
  }

  const handleFollow = async () => {
    try {
      const res = await api.post(`/users/${username}/follow`)
      setFollowing(res.data.following)
      setProfile((p) => ({
        ...p,
        followerCount: p.followerCount + (res.data.following ? 1 : -1)
      }))
    } catch {}
  }

  if (loading) return <div className="pt-20"><LoadingSpinner /></div>
  if (!profile) return null

  return (
    <div className="pb-24 min-h-screen">
      <div className="sticky top-0 bg-white border-b border-gray-100 safe-area-pt z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">@{username}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-brand-100 flex items-center justify-center overflow-hidden shrink-0 text-3xl">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
              : '👤'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900">@{profile.username}</h2>
            {profile.bio && <p className="text-gray-500 text-sm mt-1">{profile.bio}</p>}
          </div>
          {!profile.isOwn && (
            <button
              onClick={handleFollow}
              className={following ? 'btn-secondary' : 'btn-primary'}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-3 mb-6">
          <div className="card flex-1 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{profile.recipeCount}</p>
            <p className="text-xs text-gray-400">Recipes</p>
          </div>
          <div className="card flex-1 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{profile.followerCount}</p>
            <p className="text-xs text-gray-400">Followers</p>
          </div>
          <div className="card flex-1 p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{profile.followingCount}</p>
            <p className="text-xs text-gray-400">Following</p>
          </div>
        </div>

        {/* Recipes */}
        <h3 className="font-semibold text-gray-700 mb-3">Recipes</h3>
        {recipes.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-12">No public recipes yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {recipes.map((r) => <RecipeCard key={r.id} recipe={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
