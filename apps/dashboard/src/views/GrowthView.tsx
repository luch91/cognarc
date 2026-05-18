import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { fetchCreativeAssets, fetchTrustDrift } from '../api/mock.js'
import { Card } from '../components/Card.js'
import { RiskBadge } from '../components/RiskBadge.js'
import { Spinner } from '../components/Spinner.js'

const VARIANT_SCORES = [
  { id: 'v1', name: 'Variant A — "Start your journey"', cognitive_load: 34, trust: 84, manipulation: 8, rank: 1 },
  { id: 'v2', name: 'Variant B — "Unlock your potential"', cognitive_load: 41, trust: 78, manipulation: 14, rank: 2 },
  { id: 'v3', name: 'Variant C — "Act now — limited offer!"', cognitive_load: 65, trust: 43, manipulation: 67, rank: 3 },
]

export function GrowthView() {
  const { data: assets, isLoading: assLoading } = useQuery({ queryKey: ['creative-assets'], queryFn: fetchCreativeAssets })
  const { data: trustDrift, isLoading: tdLoading } = useQuery({ queryKey: ['trust-drift'], queryFn: fetchTrustDrift })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadLabel, setUploadLabel] = useState<string | null>(null)

  const spring = trustDrift?.filter((d) => d.campaign === 'Spring Launch') ?? []
  const retention = trustDrift?.filter((d) => d.campaign === 'Retention Drive') ?? []
  const chartData = spring.map((s, i) => ({
    date: s.date,
    'Spring Launch': s.trust,
    'Retention Drive': retention[i]?.trust,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Growth View</h1>

      {/* Creative Evaluation Queue */}
      <Card
        title="Creative Evaluation Queue"
        action={
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs bg-brand-500 text-white px-3 py-1 rounded-lg hover:bg-brand-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            + Upload asset
          </button>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,text/*,video/*"
          className="hidden"
          aria-label="Upload creative asset"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) setUploadLabel(`"${file.name}" queued for evaluation`)
          }}
        />
        {uploadLabel && (
          <div className="mb-3 text-xs bg-blue-50 text-blue-700 px-3 py-2 rounded-lg">{uploadLabel}</div>
        )}
        {assLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <div className="space-y-2">
            {assets?.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                <span className="text-lg" aria-hidden>
                  {a.type === 'image' ? '🖼' : a.type === 'video' ? '🎬' : '📝'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{a.name}</p>
                  <p className="text-xs text-gray-400">{new Date(a.uploaded_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {a.status === 'complete' && a.cognitive_load !== undefined && (
                    <span className="text-xs text-gray-500">
                      Load: <span className="font-semibold">{a.cognitive_load}</span> · Trust: <span className="font-semibold">{a.trust}</span>
                    </span>
                  )}
                  <RiskBadge risk={a.risk} />
                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                    a.status === 'complete' ? 'bg-green-100 text-green-700' :
                    a.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {a.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Variant Ranker */}
      <Card title="Variant Ranker">
        <p className="text-xs text-gray-400 mb-3">Ranked by cognitive safety score (lower load + higher trust + lower manipulation = better).</p>
        <div className="space-y-2">
          {VARIANT_SCORES.map((v) => (
            <div key={v.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${v.rank === 1 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                {v.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{v.name}</p>
              </div>
              <div className="flex gap-4 text-xs text-gray-500 shrink-0">
                <span>Load: <strong className={v.cognitive_load > 60 ? 'text-danger' : 'text-gray-700'}>{v.cognitive_load}</strong></span>
                <span>Trust: <strong className="text-gray-700">{v.trust}</strong></span>
                <span>Manip: <strong className={v.manipulation > 40 ? 'text-danger' : 'text-gray-700'}>{v.manipulation}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Brand Trust Drift */}
      <Card title="Brand Trust Drift — Campaign Comparison">
        {tdLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={6} />
              <YAxis domain={[40, 100]} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Spring Launch" stroke="#4f6ef7" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Retention Drive" stroke="#f59e0b" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}
