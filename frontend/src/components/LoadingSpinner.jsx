export default function LoadingSpinner({ size = 'md', label = 'Loading...' }) {
  const sizeClass = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }[size] || 'w-8 h-8'
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12" role="status">
      <div className={`${sizeClass} border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin`} />
      <p className="text-gray-400 text-sm">{label}</p>
    </div>
  )
}
