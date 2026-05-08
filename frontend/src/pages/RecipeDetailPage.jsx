import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'
import LoadingSpinner from '../components/LoadingSpinner'

// ── Icons ─────────────────────────────────────────────────────────────────────

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

const PencilIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(mins) {
  if (!mins) return null
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// Parse a fraction string like "1/2" or a decimal like "1.5" to a float.
function parseFraction(str) {
  str = String(str).replace(',', '.')
  if (str.includes('/')) {
    const [a, b] = str.split('/')
    return parseFloat(a) / parseFloat(b)
  }
  return parseFloat(str)
}

// Format a number as a nice fraction string where applicable.
function formatScaled(n) {
  if (!isFinite(n) || n <= 0) return String(n)
  const whole = Math.floor(n)
  const dec = Math.round((n - whole) * 100) / 100
  const fracMap = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔', 0.2: '⅕', 0.4: '⅖', 0.6: '⅗', 0.8: '⅘' }
  const frac = fracMap[dec]
  if (dec === 0) return String(whole)
  if (whole === 0 && frac) return frac
  if (frac) return `${whole}${frac}`
  return String(Math.round(n * 10) / 10)
}

// Scale all numbers in an ingredient string by `factor`.
// Handles "150 g", "1/2 ts", "2-3 egg" (scales both ends of a range).
function scaleIngredient(text, factor) {
  if (factor === 1) return text
  // Match: optional leading fraction "1/2", or decimal "1.5", or integer "2"
  return text.replace(/(\d+(?:[.,]\d+)?(?:\/\d+)?)/g, (match) => {
    const val = parseFraction(match)
    if (isNaN(val)) return match
    return formatScaled(val * factor)
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RecipeDetailPage() {
  const { id } = useParams()
  const [recipe, setRecipe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [shareMsg, setShareMsg] = useState('')

  // Edit mode state
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Portion scaling (display only, does not change saved recipe)
  const [currentServings, setCurrentServings] = useState(null)

  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { fetchRecipe() }, [id])

  const fetchRecipe = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/recipes/${id}`)
      setRecipe(res.data)
      setCurrentServings(res.data.servings || 4)
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
    const shareData = { title: recipe.title, text: `Check out this recipe: ${recipe.title}`, url: window.location.href }
    if (navigator.share) {
      try { await navigator.share(shareData) } catch {}
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

  // ── Edit handlers ────────────────────────────────────────────────────────────

  const enterEditMode = () => {
    setEditData({
      title: recipe.title,
      description: recipe.description || '',
      ingredients: [...recipe.ingredients],
      steps: [...recipe.steps],
      image_url: recipe.image_url || '',
      source_url: recipe.source_url || '',
      servings: recipe.servings || 4,
      prep_time: recipe.prep_time || 0,
      cook_time: recipe.cook_time || 0,
      tags: [...(recipe.tags || [])],
      is_public: recipe.is_public,
    })
    setEditError('')
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setEditData(null)
    setEditError('')
  }

  const saveEdit = async () => {
    if (!editData.title.trim()) { setEditError('Title is required'); return }
    setSaving(true)
    setEditError('')
    try {
      const res = await api.put(`/recipes/${id}`, {
        ...editData,
        ingredients: editData.ingredients.filter(s => s.trim()),
        steps: editData.steps.filter(s => s.trim()),
        tags: editData.tags.filter(s => s.trim()),
      })
      setRecipe(res.data)
      setCurrentServings(res.data.servings || 4)
      setEditMode(false)
      setEditData(null)
    } catch {
      setEditError('Could not save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const setField = (key, value) => setEditData(prev => ({ ...prev, [key]: value }))

  const setListItem = (key, index, value) =>
    setEditData(prev => ({ ...prev, [key]: prev[key].map((v, i) => i === index ? value : v) }))

  const removeListItem = (key, index) =>
    setEditData(prev => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }))

  const addListItem = (key) =>
    setEditData(prev => ({ ...prev, [key]: [...prev[key], ''] }))

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <div className="pt-20"><LoadingSpinner /></div>
  if (!recipe) return null

  const isOwner = user?.id === recipe.user_id
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)
  const scaleFactor = (recipe.servings > 0 && currentServings > 0)
    ? currentServings / recipe.servings
    : 1

  return (
    <div className="pb-28 min-h-screen">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 safe-area-pt">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={editMode ? cancelEdit : () => navigate(-1)} className="btn-ghost p-2">
            {editMode ? (
              <span className="text-sm font-medium text-gray-500">Cancel</span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            )}
          </button>

          <div className="flex items-center gap-2">
            {editMode ? (
              <button
                onClick={saveEdit}
                disabled={saving}
                className="btn-primary px-4 py-1.5 text-sm rounded-full disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            ) : (
              <>
                {shareMsg && <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">{shareMsg}</span>}
                <button onClick={handleShare} className="btn-ghost p-2" aria-label="Share recipe"><ShareIcon /></button>
                {!isOwner && (
                  <button onClick={handleSave} className={`btn-ghost p-2 ${saved ? 'text-brand-500' : ''}`} aria-label={saved ? 'Unsave' : 'Save'}>
                    <BookmarkIcon filled={saved} />
                  </button>
                )}
                {isOwner && (
                  <>
                    <button onClick={enterEditMode} className="btn-ghost p-2 text-gray-500" aria-label="Edit recipe">
                      <PencilIcon />
                    </button>
                    <button onClick={handleDelete} className="btn-ghost p-2 text-red-400" aria-label="Delete recipe">
                      <TrashIcon />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Hero image ── */}
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

        {editError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{editError}</div>
        )}

        {/* ── Title + author ── */}
        <div>
          {editMode ? (
            <input
              className="w-full text-2xl font-bold text-gray-900 border-b-2 border-brand-400 focus:outline-none bg-transparent pb-1"
              value={editData.title}
              onChange={e => setField('title', e.target.value)}
              placeholder="Recipe title"
            />
          ) : (
            <h1 className="text-2xl font-bold text-gray-900 leading-snug">{recipe.title}</h1>
          )}
          {recipe.author_username && !editMode && (
            <button className="text-brand-500 text-sm font-medium mt-1" onClick={() => navigate(`/user/${recipe.author_username}`)}>
              @{recipe.author_username}
            </button>
          )}
          {editMode ? (
            <textarea
              className="w-full mt-2 text-sm text-gray-500 border border-gray-200 rounded-xl p-3 focus:outline-none focus:border-brand-400 resize-none"
              rows={2}
              value={editData.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Short description (optional)"
            />
          ) : (
            recipe.description && <p className="text-gray-500 text-sm mt-2 leading-relaxed">{recipe.description}</p>
          )}
        </div>

        {/* ── Stats row ── */}
        <div className="flex gap-4 flex-wrap">
          {editMode ? (
            <>
              <label className="flex flex-col flex-1 min-w-[80px] bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-xs text-gray-400 mb-1">Prep (min)</span>
                <input type="number" min="0" className="font-semibold text-gray-900 bg-transparent focus:outline-none w-full"
                  value={editData.prep_time} onChange={e => setField('prep_time', parseInt(e.target.value) || 0)} />
              </label>
              <label className="flex flex-col flex-1 min-w-[80px] bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-xs text-gray-400 mb-1">Cook (min)</span>
                <input type="number" min="0" className="font-semibold text-gray-900 bg-transparent focus:outline-none w-full"
                  value={editData.cook_time} onChange={e => setField('cook_time', parseInt(e.target.value) || 0)} />
              </label>
              <label className="flex flex-col flex-1 min-w-[80px] bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-xs text-gray-400 mb-1">Servings</span>
                <input type="number" min="1" className="font-semibold text-gray-900 bg-transparent focus:outline-none w-full"
                  value={editData.servings} onChange={e => setField('servings', parseInt(e.target.value) || 1)} />
              </label>
            </>
          ) : (
            <>
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
              {/* Portion scaler */}
              {recipe.servings > 0 && (
                <div className="flex flex-col items-center bg-gray-50 rounded-xl px-3 py-3 flex-1 min-w-[100px]">
                  <span className="text-xs text-gray-400 mb-1">Serves</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentServings(s => Math.max(1, s - 1))}
                      className="w-6 h-6 rounded-full bg-gray-200 hover:bg-brand-100 text-gray-700 font-bold text-sm flex items-center justify-center leading-none"
                      aria-label="Fewer servings"
                    >−</button>
                    <span className="font-semibold text-gray-900 min-w-[1.5rem] text-center">{currentServings}</span>
                    <button
                      onClick={() => setCurrentServings(s => s + 1)}
                      className="w-6 h-6 rounded-full bg-gray-200 hover:bg-brand-100 text-gray-700 font-bold text-sm flex items-center justify-center leading-none"
                      aria-label="More servings"
                    >+</button>
                  </div>
                  {scaleFactor !== 1 && (
                    <span className="text-xs text-brand-500 mt-0.5 font-medium">
                      ×{Math.round(scaleFactor * 100) / 100}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Tags ── */}
        {!editMode && recipe.tags?.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {recipe.tags.map((tag, i) => <span key={i} className="tag">{tag}</span>)}
          </div>
        )}

        {/* ── Ingredients ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">
              Ingredients
              {!editMode && scaleFactor !== 1 && (
                <span className="ml-2 text-xs font-normal text-brand-500 bg-brand-50 px-2 py-0.5 rounded-full">
                  scaled ×{Math.round(scaleFactor * 100) / 100}
                </span>
              )}
            </h2>
          </div>

          {editMode ? (
            <ul className="space-y-2">
              {editData.ingredients.map((ing, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-brand-400 rounded-full shrink-0" />
                  <input
                    className="flex-1 text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-400"
                    value={ing}
                    onChange={e => setListItem('ingredients', i, e.target.value)}
                    placeholder={`Ingredient ${i + 1}`}
                  />
                  <button
                    onClick={() => removeListItem('ingredients', i)}
                    className="text-gray-300 hover:text-red-400 text-lg leading-none px-1 shrink-0"
                    aria-label="Remove ingredient"
                  >×</button>
                </li>
              ))}
              <button
                onClick={() => addListItem('ingredients')}
                className="mt-1 text-sm text-brand-500 hover:text-brand-700 font-medium flex items-center gap-1"
              >
                <span className="text-lg leading-none">+</span> Add ingredient
              </button>
            </ul>
          ) : (
            recipe.ingredients?.length > 0 ? (
              <ul className="space-y-2">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="w-2 h-2 bg-brand-400 rounded-full mt-1.5 shrink-0" />
                    {scaleFactor !== 1 ? scaleIngredient(ing, scaleFactor) : ing}
                  </li>
                ))}
              </ul>
            ) : null
          )}
        </section>

        {/* ── Steps ── */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Steps</h2>

          {editMode ? (
            <ol className="space-y-3">
              {editData.steps.map((step, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-8 h-8 bg-brand-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <textarea
                    className="flex-1 text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-400 resize-none leading-relaxed"
                    rows={2}
                    value={step}
                    onChange={e => setListItem('steps', i, e.target.value)}
                    placeholder={`Step ${i + 1}`}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                  />
                  <button
                    onClick={() => removeListItem('steps', i)}
                    className="text-gray-300 hover:text-red-400 text-lg leading-none px-1 shrink-0 mt-2"
                    aria-label="Remove step"
                  >×</button>
                </li>
              ))}
              <button
                onClick={() => addListItem('steps')}
                className="mt-1 text-sm text-brand-500 hover:text-brand-700 font-medium flex items-center gap-1"
              >
                <span className="text-lg leading-none">+</span> Add step
              </button>
            </ol>
          ) : (
            recipe.steps?.length > 0 ? (
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
            ) : null
          )}
        </section>

        {/* ── Extra edit fields (image URL, source URL) ── */}
        {editMode && (
          <section className="space-y-4 border-t border-gray-100 pt-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Image URL</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-brand-400"
                value={editData.image_url}
                onChange={e => setField('image_url', e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Source URL</label>
              <input
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-brand-400"
                value={editData.source_url}
                onChange={e => setField('source_url', e.target.value)}
                placeholder="https://…"
              />
            </div>
          </section>
        )}

        {/* ── Source link (view mode) ── */}
        {!editMode && recipe.source_url && (() => {
          let hostname = recipe.source_url
          try { hostname = new URL(recipe.source_url).hostname.replace(/^www\./, '') } catch {}
          return (
            <a href={recipe.source_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-brand-500 hover:text-brand-700 font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              From {hostname}
            </a>
          )
        })()}
      </div>
    </div>
  )
}
