import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'
import RecipeCard from '../components/RecipeCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'

export default function CookbookPage() {
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('mine') // 'mine' | 'saved'
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchRecipes()
  }, [filter])

  const fetchRecipes = async () => {
    setLoading(true)
    try {
      const endpoint = filter === 'saved' ? '/recipes/saved/list' : '/recipes'
      const res = await api.get(endpoint)
      setRecipes(res.data)
    } catch {
      setRecipes([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pb-24 min-h-screen">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 safe-area-pt z-10">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-2xl font-bold text-gray-900">My Cookbook</h1>
            <span className="text-sm text-gray-400">{recipes.length} recipes</span>
          </div>
          {/* Filter tabs */}
          <div className="flex gap-2">
            {[
              { key: 'mine', label: 'My Recipes' },
              { key: 'saved', label: 'Saved' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${
                  filter === key
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {loading ? (
          <LoadingSpinner />
        ) : recipes.length === 0 ? (
          <EmptyState
            icon="📋"
            title={filter === 'saved' ? 'No saved recipes yet' : 'Your cookbook is empty'}
            message={
              filter === 'saved'
                ? 'Browse the feed and save recipes you love'
                : 'Start building your collection by adding your first recipe'
            }
            action={
              filter === 'mine' && (
                <button
                  className="btn-primary"
                  onClick={() => navigate('/add')}
                >
                  Add First Recipe
                </button>
              )
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
