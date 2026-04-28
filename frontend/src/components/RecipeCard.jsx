import { useNavigate } from 'react-router-dom'

const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  </svg>
)

function formatTime(mins) {
  if (!mins) return null
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function RecipeCard({ recipe, onClick }) {
  const navigate = useNavigate()
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)

  const handleClick = () => {
    if (onClick) onClick(recipe)
    else navigate(`/recipe/${recipe.id}`)
  }

  return (
    <div
      className="card overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      onClick={handleClick}
      data-testid="recipe-card"
    >
      {recipe.image_url ? (
        <div className="aspect-video w-full overflow-hidden bg-gray-100">
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        </div>
      ) : (
        <div className="aspect-video w-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center">
          <span className="text-4xl">🍽️</span>
        </div>
      )}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 text-base leading-snug mb-1 line-clamp-2">
          {recipe.title}
        </h3>
        {recipe.description && (
          <p className="text-gray-500 text-sm line-clamp-2 mb-3">{recipe.description}</p>
        )}
        <div className="flex items-center gap-3 text-gray-400 text-xs">
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <ClockIcon />
              {formatTime(totalTime)}
            </span>
          )}
          {recipe.servings > 0 && (
            <span className="flex items-center gap-1">
              <UsersIcon />
              {recipe.servings} servings
            </span>
          )}
          {recipe.author_username && recipe.author_username !== recipe.own && (
            <span className="ml-auto text-brand-500 font-medium">@{recipe.author_username}</span>
          )}
        </div>
        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex gap-1 mt-3 flex-wrap">
            {recipe.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
