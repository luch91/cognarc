import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
} from 'recharts'
import { fetchAlignmentTrend, fetchModelProfiles } from '../api/mock.js'
import { Card } from '../components/Card.js'
import { LiveEventStream } from '../components/LiveEventStream.js'
import { ScoreGauge } from '../components/ScoreGauge.js'
import { Spinner } from '../components/Spinner.js'
import { useAppContext } from '../context/AppContext.js'

export function PMView() {
  const { data: alignment, isLoading: alLoading } = useQuery({ queryKey: ['alignment-trend'], queryFn: fetchAlignmentTrend })
  const { data: models, isLoading: modLoading } = useQuery({ queryKey: ['model-profiles'], queryFn: fetchModelProfiles })
  const { connectors } = useAppContext()

  const latestAlignment = alignment?.[alignment.length - 1]?.score

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Product Manager View</h1>

      {/* Alignment score summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="sm:col-span-1">
          <div className="flex flex-col items-center py-2">
            {latestAlignment === undefined
              ? <p className="text-sm text-gray-500">No measured alignment score</p>
              : <ScoreGauge label="Current Alignment Score" value={latestAlignment} />}
          </div>
        </Card>

        {/* Alignment trend */}
        <Card title="30-Day Cognitive-Behavioral Alignment" className="sm:col-span-2">
          {alLoading || !alignment ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : !alignment.length ? (
            <p className="text-sm text-gray-500">No verified alignment history is connected.</p>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={alignment} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={6} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${v}`, 'Score']} />
                <Line type="monotone" dataKey="score" stroke="#4f6ef7" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Analytics connector status */}
      <Card title="Analytics Connector Status">
        {connectors.length === 0 && <p className="text-sm text-gray-500 mb-2">No analytics connector has a verified integration.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Connector status">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left py-2 pr-4 font-semibold">Connector</th>
                <th className="text-left py-2 px-2 font-semibold">Status</th>
                <th className="text-right py-2 px-2 font-semibold">Events today</th>
                <th className="text-left py-2 px-2 font-semibold">Write-back</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {connectors.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4 font-semibold text-gray-700">{c.name}</td>
                  <td className="py-2 px-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${c.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {c.status === 'connected' ? 'Healthy' : 'Degraded'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-700">{c.eventsToday.toLocaleString()}</td>
                  <td className="py-2 px-2">
                    <span className={`text-xs ${c.writeBack ? 'text-green-600' : 'text-gray-400'}`}>
                      {c.writeBack ? '✓ Enabled' : '— Disabled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Live Event Stream (STREAM-03 + STREAM-04) — replaces hardcoded Recent Event Labels */}
      <LiveEventStream />

      <Card title="Onboarding Flow">
        <p className="text-sm text-gray-500">
          No verified onboarding behavior or measured load series is connected.
          The previous illustration is excluded from operational reporting.
        </p>
      </Card>

      {/* Model Cognitive Profile */}
      <Card title="Connected Model Cognitive Profiles">
        {modLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <div className="overflow-x-auto">
            {(!models || models.length === 0) && <p className="text-sm text-gray-500 mb-2">No verified model evaluations yet.</p>}
            <table className="w-full text-sm" aria-label="Model profiles">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-semibold">Model</th>
                  <th className="text-left py-2 px-2 font-semibold">Provider</th>
                  <th className="text-right py-2 px-2 font-semibold">Load avg</th>
                  <th className="text-right py-2 px-2 font-semibold">Comprehension</th>
                  <th className="text-right py-2 px-2 font-semibold">Trust</th>
                  <th className="text-right py-2 px-2 font-semibold">Manipulation</th>
                  <th className="text-left py-2 pl-2 font-semibold">Benchmarked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {models?.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-4 font-mono text-xs text-gray-700">{m.name}</td>
                    <td className="py-2 px-2 text-gray-500">{m.provider}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{m.cognitive_load_avg}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{m.comprehension_avg}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{m.trust_avg}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{m.manipulation_avg}</td>
                    <td className="py-2 pl-2 text-xs text-gray-400">{m.benchmark_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
