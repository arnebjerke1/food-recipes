import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'

const TABS = [
  { key: 'url', label: '🔗 From URL' },
  { key: 'manual', label: '✍️ Manual' },
]

function TagInput({ tags, onChange }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const t = input.trim()
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput('')
  }

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-2">
        {tags.map((tag, i) => (
          <span key={i} className="tag flex items-center gap-1">
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
              className="text-brand-400 hover:text-brand-700 ml-0.5"
            >×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="e.g. Italian, Pasta"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
        />
        <button type="button" className="btn-secondary" onClick={addTag}>Add</button>
      </div>
    </div>
  )
}

function ListInput({ items, onChange, placeholder }) {
  const updateItem = (i, val) => {
    const next = [...items]
    next[i] = val
    onChange(next)
  }
  const addItem = () => onChange([...items, ''])
  const removeItem = (i) => onChange(items.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="text-gray-400 text-sm mt-3 w-5 shrink-0">{i + 1}.</span>
          <textarea
            className="input flex-1 min-h-[44px] resize-none"
            placeholder={placeholder}
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            rows={2}
          />
          <button
            type="button"
            className="text-red-400 hover:text-red-600 mt-3 shrink-0"
            onClick={() => removeItem(i)}
          >×</button>
        </div>
      ))}
      <button type="button" className="btn-ghost text-sm w-full" onClick={addItem}>
        + Add {placeholder.split(' ')[0]}
      </button>
    </div>
  )
}

export default function AddRecipePage() {
  const [tab, setTab] = useState('url')
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [form, setForm] = useState({
    title: '',
    description: '',
    ingredients: [''],
    steps: [''],
    image_url: '',
    source_url: '',
    servings: 4,
    prep_time: 0,
    cook_time: 0,
    tags: [],
    is_public: true,
  })

  const navigate = useNavigate()

  const handleParseUrl = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    setParsing(true)
    setParseError('')
    try {
      const res = await api.post('/scraper/parse-url', { url })
      const data = res.data
      setForm({
        title: data.title || '',
        description: data.description || '',
        ingredients: data.ingredients?.length ? data.ingredients : [''],
        steps: data.steps?.length ? data.steps : [''],
        image_url: data.image_url || '',
        source_url: data.source_url || url,
        servings: data.servings || 4,
        prep_time: data.prep_time || 0,
        cook_time: data.cook_time || 0,
        tags: data.tags || [],
        is_public: true,
      })
      setTab('manual')
    } catch (err) {
      setParseError(err.response?.data?.error || 'Could not parse recipe. Please add it manually.')
    } finally {
      setParsing(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      const payload = {
        ...form,
        ingredients: form.ingredients.filter(Boolean),
        steps: form.steps.filter(Boolean),
      }
      const res = await api.post('/recipes', payload)
      navigate(`/recipe/${res.data.id}`)
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Could not save recipe.')
    } finally {
      setSaving(false)
    }
  }

  const setField = (field) => (val) => setForm((f) => ({ ...f, [field]: val }))

  return (
    <div className="pb-28 min-h-screen">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 safe-area-pt z-10">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="btn-ghost p-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">Add Recipe</h1>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-lg mx-auto px-4 pb-3">
          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
                  tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {tab === 'url' ? (
          <div>
            <p className="text-gray-500 text-sm mb-4">
              Paste a URL from any recipe website and we'll automatically extract the recipe for you.
            </p>
            <form onSubmit={handleParseUrl} className="space-y-4">
              {parseError && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                  {parseError}
                </div>
              )}
              <input
                type="url"
                className="input"
                placeholder="https://www.allrecipes.com/recipe/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary w-full py-3" disabled={parsing}>
                {parsing ? 'Fetching recipe…' : 'Import Recipe'}
              </button>
            </form>
            <div className="mt-8 p-4 bg-brand-50 rounded-xl">
              <p className="text-sm text-brand-700 font-medium mb-1">💡 Tips</p>
              <ul className="text-sm text-brand-600 space-y-1 list-disc list-inside">
                <li>Works with most popular recipe websites</li>
                <li>YouTube video URLs are not yet supported for extraction</li>
                <li>After import, you can edit all recipe details</li>
              </ul>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {saveError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                {saveError}
              </div>
            )}

            {/* Basic Info */}
            <section>
              <h2 className="font-semibold text-gray-900 mb-3">Basic Info</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipe Title *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Grandma's Lasagna"
                    value={form.title}
                    onChange={(e) => setField('title')(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    className="input min-h-[80px] resize-none"
                    placeholder="A brief description of the dish..."
                    value={form.description}
                    onChange={(e) => setField('description')(e.target.value)}
                    rows={3}
                  />
                </div>
                {form.image_url && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                    <input
                      type="url"
                      className="input"
                      placeholder="https://..."
                      value={form.image_url}
                      onChange={(e) => setField('image_url')(e.target.value)}
                    />
                    {form.image_url && (
                      <img src={form.image_url} alt="preview" className="mt-2 rounded-xl w-full aspect-video object-cover" onError={(e) => (e.target.style.display = 'none')} />
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Details */}
            <section>
              <h2 className="font-semibold text-gray-900 mb-3">Details</h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Servings</label>
                  <input type="number" className="input text-center" min={1} value={form.servings} onChange={(e) => setField('servings')(parseInt(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Prep (min)</label>
                  <input type="number" className="input text-center" min={0} value={form.prep_time} onChange={(e) => setField('prep_time')(parseInt(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cook (min)</label>
                  <input type="number" className="input text-center" min={0} value={form.cook_time} onChange={(e) => setField('cook_time')(parseInt(e.target.value))} />
                </div>
              </div>
            </section>

            {/* Ingredients */}
            <section>
              <h2 className="font-semibold text-gray-900 mb-3">Ingredients</h2>
              <ListInput items={form.ingredients} onChange={setField('ingredients')} placeholder="Ingredient (e.g. 2 cups flour)" />
            </section>

            {/* Steps */}
            <section>
              <h2 className="font-semibold text-gray-900 mb-3">Steps</h2>
              <ListInput items={form.steps} onChange={setField('steps')} placeholder="Step description" />
            </section>

            {/* Tags */}
            <section>
              <h2 className="font-semibold text-gray-900 mb-3">Tags</h2>
              <TagInput tags={form.tags} onChange={setField('tags')} />
            </section>

            {/* Visibility */}
            <section>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.is_public ? 'bg-brand-500' : 'bg-gray-300'}`}
                  onClick={() => setField('is_public')(!form.is_public)}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_public ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
                <span className="text-sm font-medium text-gray-700">
                  {form.is_public ? 'Public – visible to followers' : 'Private – only you'}
                </span>
              </label>
            </section>

            {/* Source URL */}
            {form.source_url && (
              <section>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source URL</label>
                <input
                  type="url"
                  className="input"
                  value={form.source_url}
                  onChange={(e) => setField('source_url')(e.target.value)}
                />
              </section>
            )}

            <button type="submit" className="btn-primary w-full py-3 text-base" disabled={saving}>
              {saving ? 'Saving…' : 'Save Recipe'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
