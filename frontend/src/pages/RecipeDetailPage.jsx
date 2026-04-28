import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'

const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
  </svg>
)

const BookmarkIcon = ({ filled }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
  </svg>
)

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
)

function formatTime(mins) {
  if (!mins) return null
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function RecipeDetailPage() {
  const { id } = useParams()
  const [recipe, setRecipe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [shareMsg, setShareMsg] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchRecipe()
  }, [id])

  const fetchRecipe = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/recipes/${id}`)
      setRecipe(res.data)
    } catch {
      navigate(-1)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const res = await api.post(`/recipes/${id}/save`)
      setSaved(res.data.saved)
    } catch {}
  }

  const handleShare = async () => {
    const shareData = {
      title: recipe.title,
      text: `Check out this recipe: ${recipe.title}`,
      url: window.location.href,
    }
    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href)
        setShareMsg('Link copied!')
        setTimeout(() => setShareMsg(''), 2000)
      } catch {}
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Delete this recipe? This cannot be undone.')) return
    try {
      await api.delete(`/recipes/${id}`)
      navigate('/cookbook')
    } catch {}
  }

  if (loading) return <div className="pt-20"><LoadingSpinner /></div>
  if (!recipe) return null

  const isOwner = user?.id === recipe.user_id
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)

  return (
    <div className="pb-28 min-h-screen">
      {/* Back button */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 safe-area-pt">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            {shareMsg && <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">{shareMsg}</span>}
            <button onClick={handleShare} className="btn-ghost p-2" aria-label="Share recipe">
              <ShareIcon />
            </button>
            {!isOwner && (
              <button
                onClick={handleSave}
                className={`btn-ghost p-2 ${saved ? 'text-brand-500' : ''}`}
                aria-label={saved ? 'Unsave recipe' : 'Save recipe'}
              >
                <BookmarkIcon filled={saved} />
              </button>
            )}
            {isOwner && (
              <button
                onClick={handleDelete}
                className="btn-ghost p-2 text-red-400"
                aria-label="Delete recipe"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hero image */}
      {recipe.image_url ? (
        <div className="w-full aspect-video bg-gray-100 overflow-hidden">
          <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-full aspect-video bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center">
          <span className="text-7xl">🍽️</span>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {/* Title + author */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-snug">{recipe.title}</h1>
          {recipe.author_username && (
            <button
              className="text-brand-500 text-sm font-medium mt-1"
              onClick={() => navigate(`/user/${recipe.author_username}`)}
            >
              @{recipe.author_username}
            </button>
          )}
          {recipe.description && (
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">{recipe.description}</p>
          )}
        </div>

        {/* Stats row */}
        <div className="flex gap-4 flex-wrap">
          {recipe.prep_time > 0 && (
            <div className="flex flex-col items-center bg-gray-50 rounded-xl px-4 py-3 flex-1 min-w-[80px]">
              <span className="text-xs text-gray-400 mb-1">Prep</span>
              <span className="font-semibold text-gray-900">{formatTime(recipe.prep_time)}</span>
            </div>
          )}
          {recipe.cook_time > 0 && (
            <div className="flex flex-col items-center bg-gray-50 rounded-xl px-4 py-3 flex-1 min-w-[80px]">
              <span className="text-xs text-gray-400 mb-1">Cook</span>
              <span className="font-semibold text-gray-900">{formatTime(recipe.cook_time)}</span>
            </div>
          )}
          {totalTime > 0 && (
            <div className="flex flex-col items-center bg-brand-50 rounded-xl px-4 py-3 flex-1 min-w-[80px]">
              <span className="text-xs text-brand-400 mb-1">Total</span>
              <span className="font-semibold text-brand-700">{formatTime(totalTime)}</span>
            </div>
          )}
          {recipe.servings > 0 && (
            <div className="flex flex-col items-center bg-gray-50 rounded-xl px-4 py-3 flex-1 min-w-[80px]">
              <span className="text-xs text-gray-400 mb-1">Serves</span>
              <span className="font-semibold text-gray-900">{recipe.servings}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {recipe.tags?.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {recipe.tags.map((tag, i) => <span key={i} className="tag">{tag}</span>)}
          </div>
        )}

        {/* Ingredients */}
        {recipe.ingredients?.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">Ingredients</h2>
            <ul className="space-y-2">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="w-2 h-2 bg-brand-400 rounded-full mt-1.5 shrink-0" />
                  {ing}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Steps */}
        {recipe.steps?.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">Steps</h2>
            <ol className="space-y-4">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex-shrink-0 w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    {i + 1}
                  </span>
                  <p className="text-sm text-gray-700 leading-relaxed pt-1">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Source link */}
        {recipe.source_url && (
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-brand-500 hover:text-brand-700 font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            View original source
          </a>
        )}
      </div>
    </div>
  )
}
