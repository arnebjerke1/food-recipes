import { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'
import RecipeCard from '../components/RecipeCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useNavigate } from 'react-router-dom'

export default function FeedPage() {
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchFeed()
  }, [])

  const fetchFeed = async () => {
    setLoading(true)
    try {
      const res = await api.get('/recipes/feed')
      setRecipes(res.data)
    } catch {
      setRecipes([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pb-24 min-h-screen">
      <div className="sticky top-0 bg-white border-b border-gray-100 safe-area-pt z-10">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Feed</h1>
            <span className="text-3xl">📖</span>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {loading ? (
          <LoadingSpinner />
        ) : recipes.length === 0 ? (
          <EmptyState
            icon="👥"
            title="Nothing in your feed yet"
            message="Follow friends to see their recipes here. Try searching for people you know!"
            action={
              <button className="btn-primary" onClick={() => navigate('/search')}>
                Find Friends
              </button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
