import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchKillSwitch, setKillSwitch } from '../api/mock.js'

export function KillSwitch() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['kill-switch'], queryFn: fetchKillSwitch, refetchInterval: 5000 })

  const mutation = useMutation({
    mutationFn: (active: boolean) => setKillSwitch(active),
    onMutate: async (active) => {
      await qc.cancelQueries({ queryKey: ['kill-switch'] })
      const prev = qc.getQueryData(['kill-switch'])
      qc.setQueryData(['kill-switch'], { active, activated_at: active ? new Date().toISOString() : null, activated_by: active ? 'user:admin' : null })
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['kill-switch'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['kill-switch'] }),
  })

  const active = data?.active ?? false

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 transition-colors ${active ? 'border-danger bg-red-50' : 'border-gray-200 bg-white'}`}>
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Kill Switch</span>
      <button
        onClick={() => mutation.mutate(!active)}
        disabled={mutation.isPending}
        aria-pressed={active}
        aria-label={active ? 'Deactivate kill switch' : 'Activate kill switch'}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-danger ${active ? 'bg-danger' : 'bg-gray-300'} ${mutation.isPending ? 'opacity-60' : ''}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${active ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
      {active && (
        <span className="text-xs text-danger font-semibold animate-pulse">ACTIVE</span>
      )}
    </div>
  )
}
