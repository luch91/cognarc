export function Spinner({ size = 6 }: { size?: number }) {
  return (
    <div
      className={`w-${size} h-${size} border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin`}
      role="status"
      aria-label="Loading"
    />
  )
}
