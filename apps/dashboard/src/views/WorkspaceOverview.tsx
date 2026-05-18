import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { fetchAgentActivity, fetchHealthTrend, fetchSurfaces } from '../api/mock.js'
import { Card } from '../components/Card.js'
import { ScoreGauge } from '../components/ScoreGauge.js'
import { Spinner } from '../components/Spinner.js'
import { ZoneBadge } from '../components/ZoneBadge.js'

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-success',
  degraded: 'bg-warning',
  offline: 'bg-danger',
}

export function WorkspaceOverview() {
  const { data: trend, isLoading: trendLoading } = useQuery({ queryKey: ['health-trend'], queryFn: fetchHealthTrend })
  const { data: activity, isLoading: actLoading } = useQuery({ queryKey: ['agent-activity'], queryFn: fetchAgentActivity, refetchInterval: 30000 })
  const { data: surfaces, isLoading: surfLoading } = useQuery({ queryKey: ['surfaces'], queryFn: fetchSurfaces })

  const latest = trend?.[trend.length - 1]
  const pendingGated = activity?.filter((a) => a.zone === 'ACT_GATED' && a.status === 'pending') ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Workspace Overview</h1>

      {/* Health Score summary */}
      <Card title="Cognitive Health — Latest">
        {trendLoading || !latest ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <div className="flex flex-wrap gap-8 justify-around">
            <ScoreGauge label="Cognitive Load" value={latest.cognitive_load} invert />
            <ScoreGauge label="Comprehension" value={latest.comprehension} />
            <ScoreGauge label="Trust" value={latest.trust} />
            <ScoreGauge label="Manipulation Risk" value={latest.manipulation_risk} invert />
          </div>
        )}
      </Card>

      {/* 30-day trend chart */}
      <Card title="30-Day Cognitive Health Trend">
        {trendLoading || !trend ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={6} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="cognitive_load" name="Load" stroke="#f59e0b" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="comprehension" name="Comprehension" stroke="#10b981" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="trust" name="Trust" stroke="#4f6ef7" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="manipulation_risk" name="Manipulation" stroke="#ef4444" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Activity Feed */}
        <Card
          title="Agent Activity Feed"
          action={
            pendingGated.length > 0 ? (
              <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
                {pendingGated.length} pending approval{pendingGated.length > 1 ? 's' : ''}
              </span>
            ) : undefined
          }
        >
          {actLoading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (
            <ul className="space-y-3" role="list" aria-label="Agent activity">
              {activity?.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <ZoneBadge zone={item.zone} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{item.description}</p>
                    <p className="text-xs text-gray-400">{timeAgo(item.timestamp)}</p>
                  </div>
                  {item.status === 'pending' && (
                    <span className="text-xs text-orange-600 font-semibold animate-pulse shrink-0">PENDING</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Connected surfaces */}
        <Card title="Connected Surfaces">
          {surfLoading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (
            <ul className="space-y-3" role="list" aria-label="Connected surfaces">
              {surfaces?.map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[s.status]}`} aria-label={s.status} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.type} · {timeAgo(s.last_seen)}</p>
                  </div>
                  <span className="text-xs text-gray-400 capitalize">{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
