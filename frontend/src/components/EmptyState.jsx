export default function EmptyState({ icon = '🍽️', title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="font-semibold text-gray-700 text-lg mb-1">{title}</h3>
      {message && <p className="text-gray-400 text-sm mb-6 max-w-xs">{message}</p>}
      {action}
    </div>
  )
}
