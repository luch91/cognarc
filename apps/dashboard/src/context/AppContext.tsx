import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  mockAgentActivity, mockAuditLog, mockActGatedItems, mockConnectors, mockCreativeAssets,
} from '../api/mock.js'
import type { AgentAction, AuditEntry, ActGatedItem, ConnectorStatus, CreativeAsset, HealthPoint } from '../api/types.js'
import type { LiveScoreResult } from '../api/scoringApi.js'

// ── Manipulation feed entry ──────────────────────────────────────────────────
export interface ManipulationFeedEntry {
  id: number
  category: string
  score: number
  time: string
  excerpt: string
}

const INITIAL_FEED: ManipulationFeedEntry[] = [
  { id: 1, category: 'false_urgency',           score: 84, time: '2 min ago',  excerpt: 'Act now — experts unanimously agree. Limited time only...' },
  { id: 2, category: 'authority_mimicry',        score: 71, time: '11 min ago', excerpt: 'As verified by leading medical institutions, this approach...' },
  { id: 3, category: 'sycophantic_drift',        score: 58, time: '23 min ago', excerpt: "You're absolutely right, and your instinct here is spot on..." },
  { id: 4, category: 'obfuscation',              score: 63, time: '41 min ago', excerpt: 'The multifaceted synergistic framework leverages dynamic...' },
  { id: 5, category: 'false_urgency',            score: 79, time: '1 hr ago',   excerpt: 'Only 3 spots remaining. This offer expires at midnight tonight...' },
]

// ── Connector shape used by Settings + PM ─────────────────────────────────
export interface ConnectorConfig {
  id: string
  name: string
  initial: string
  color: string
  status: 'connected' | 'degraded'
  writeBack: boolean
  eventsToday: number
}

// ── Thresholds ──────────────────────────────────────────────────────────────
export interface Thresholds {
  cognitiveLoadMax: number
  manipulationRiskMax: number
  comprehensionConfidenceMin: number
}

// ── State shape ─────────────────────────────────────────────────────────────
interface AppState {
  evaluationQueue: CreativeAsset[]
  auditLog: AuditEntry[]
  actGatedQueue: ActGatedItem[]
  agentFeed: AgentAction[]
  manipulationFeed: ManipulationFeedEntry[]
  connectors: ConnectorConfig[]
  thresholds: Thresholds
  killSwitchActive: boolean
  killSwitchBanner: boolean
  hasConnectedEndpoint: boolean
  latestLiveScore: HealthPoint | null
  liveScoreTrend: HealthPoint[]
}

// ── Context value ────────────────────────────────────────────────────────────
interface AppContextValue extends AppState {
  addToEvaluationQueue: (item: CreativeAsset) => void
  updateEvaluationItem: (id: string, updates: Partial<CreativeAsset>) => void
  addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'timestamp' | 'workspace_id'>) => void
  addActGatedItem: (item: Omit<ActGatedItem, 'id' | 'requested_at'>) => void
  resolveActGatedItem: (id: string, outcome: 'approved' | 'rejected') => void
  addAgentFeedEntry: (entry: Omit<AgentAction, 'id' | 'timestamp' | 'workspace_id'>) => void
  addManipulationFeedEntry: (entry: Omit<ManipulationFeedEntry, 'id'>) => void
  updateConnector: (name: string, updates: Partial<ConnectorConfig>) => void
  updateThresholds: (updates: Partial<Thresholds>) => void
  setKillSwitch: (active: boolean) => void
  setKillSwitchBanner: (visible: boolean) => void
  setHasConnectedEndpoint: (value: boolean) => void
  recordLiveScore: (result: LiveScoreResult) => void
}

// ── Initial connectors (merged from SettingsView + PMView) ───────────────────
const INITIAL_CONNECTORS: ConnectorConfig[] = [
  { id: 'seg', name: 'Segment',   initial: 'S', color: 'bg-green-500',  status: 'connected', writeBack: true,  eventsToday: 12847 },
  { id: 'amp', name: 'Amplitude', initial: 'A', color: 'bg-blue-500',   status: 'connected', writeBack: true,  eventsToday: 8421  },
  { id: 'mix', name: 'Mixpanel',  initial: 'M', color: 'bg-purple-500', status: 'degraded',  writeBack: false, eventsToday: 0     },
  { id: 'ph',  name: 'PostHog',   initial: 'P', color: 'bg-orange-500', status: 'connected', writeBack: true,  eventsToday: 5503  },
  { id: 'ga4', name: 'GA4',       initial: 'G', color: 'bg-yellow-500', status: 'connected', writeBack: false, eventsToday: 21004 },
]

const INITIAL_STATE: AppState = {
  evaluationQueue: mockCreativeAssets,
  auditLog: mockAuditLog,
  actGatedQueue: mockActGatedItems,
  agentFeed: mockAgentActivity,
  manipulationFeed: INITIAL_FEED,
  connectors: INITIAL_CONNECTORS,
  thresholds: { cognitiveLoadMax: 80, manipulationRiskMax: 40, comprehensionConfidenceMin: 50 },
  killSwitchActive: false,
  killSwitchBanner: false,
  hasConnectedEndpoint: false,
  latestLiveScore: null,
  liveScoreTrend: [],
}

const AppContext = createContext<AppContextValue>({
  ...INITIAL_STATE,
  addToEvaluationQueue: () => {},
  updateEvaluationItem: () => {},
  addAuditEntry: () => {},
  addActGatedItem: () => {},
  resolveActGatedItem: () => {},
  addAgentFeedEntry: () => {},
  addManipulationFeedEntry: () => {},
  updateConnector: () => {},
  updateThresholds: () => {},
  setKillSwitch: () => {},
  setKillSwitchBanner: () => {},
  setHasConnectedEndpoint: () => {},
  recordLiveScore: () => {},
})

export function AppProvider({ children }: { children: ReactNode }) {
  const [evaluationQueue, setEvaluationQueue] = useState<CreativeAsset[]>(INITIAL_STATE.evaluationQueue)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(INITIAL_STATE.auditLog)
  const [actGatedQueue, setActGatedQueue] = useState<ActGatedItem[]>(INITIAL_STATE.actGatedQueue)
  const [agentFeed, setAgentFeed] = useState<AgentAction[]>(INITIAL_STATE.agentFeed)
  const [manipulationFeed, setManipulationFeed] = useState<ManipulationFeedEntry[]>(INITIAL_STATE.manipulationFeed)
  const [connectors, setConnectors] = useState<ConnectorConfig[]>(INITIAL_STATE.connectors)
  const [thresholds, setThresholds] = useState<Thresholds>(INITIAL_STATE.thresholds)
  const [killSwitchActive, setKillSwitchActive] = useState(false)
  const [killSwitchBanner, setKillSwitchBannerState] = useState(false)
  const [hasConnectedEndpoint, setHasConnectedEndpointState] = useState(false)
  const [latestLiveScore, setLatestLiveScore] = useState<HealthPoint | null>(null)
  const [liveScoreTrend, setLiveScoreTrend] = useState<HealthPoint[]>([])

  function addToEvaluationQueue(item: CreativeAsset) {
    setEvaluationQueue((prev) => [item, ...prev])
  }

  function updateEvaluationItem(id: string, updates: Partial<CreativeAsset>) {
    setEvaluationQueue((prev) => prev.map((i) => i.id === id ? { ...i, ...updates } : i))
  }

  function addAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'workspace_id'>) {
    const full: AuditEntry = {
      id: `audit-live-${Date.now()}`,
      timestamp: new Date().toISOString(),
      workspace_id: 'ws-1',
      ...entry,
    }
    setAuditLog((prev) => [full, ...prev])
  }

  function addActGatedItem(item: Omit<ActGatedItem, 'id' | 'requested_at'>) {
    const full: ActGatedItem = {
      id: `ag-live-${Date.now()}`,
      requested_at: new Date().toISOString(),
      ...item,
    }
    setActGatedQueue((prev) => [full, ...prev])
  }

  function resolveActGatedItem(id: string, outcome: 'approved' | 'rejected') {
    setActGatedQueue((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, status: outcome, reviewer: 'user:admin', reviewed_at: new Date().toISOString() }
          : i
      )
    )
    addAuditEntry({
      action_type: 'ACT_GATED_APPROVED',
      zone: 'ACT_GATED',
      policy_rule: 'rule:v1.2',
      outcome,
      authorising_human_or_policy: 'user:admin',
    })
  }

  function addAgentFeedEntry(entry: Omit<AgentAction, 'id' | 'timestamp' | 'workspace_id'>) {
    const full: AgentAction = {
      id: `feed-live-${Date.now()}`,
      timestamp: new Date().toISOString(),
      workspace_id: 'ws-1',
      ...entry,
    }
    setAgentFeed((prev) => [full, ...prev])
  }

  function addManipulationFeedEntry(entry: Omit<ManipulationFeedEntry, 'id'>) {
    const full: ManipulationFeedEntry = { id: Date.now(), ...entry }
    setManipulationFeed((prev) => [full, ...prev])
  }

  function updateConnector(name: string, updates: Partial<ConnectorConfig>) {
    setConnectors((prev) =>
      prev.map((c) => c.name.toLowerCase() === name.toLowerCase() ? { ...c, ...updates } : c)
    )
  }

  function updateThresholds(updates: Partial<Thresholds>) {
    setThresholds((prev) => ({ ...prev, ...updates }))
  }

  function setKillSwitch(active: boolean) {
    setKillSwitchActive(active)
    setKillSwitchBannerState(active)
  }

  function setKillSwitchBanner(visible: boolean) {
    setKillSwitchBannerState(visible)
  }

  function setHasConnectedEndpoint(value: boolean) {
    setHasConnectedEndpointState(value)
  }

  function recordLiveScore(result: LiveScoreResult) {
    const point: HealthPoint = {
      date: new Date().toLocaleTimeString(),
      cognitive_load: result.cognitive_load,
      comprehension: result.comprehension_confidence,
      trust: result.trust_coherence,
      manipulation_risk: result.manipulation_risk,
    }
    setLatestLiveScore(point)
    setLiveScoreTrend((prev) => [...prev, point].slice(-30))

    // Raise risk alert in agent feed if thresholds breached
    const t = thresholds
    const breaches: string[] = []
    if (result.cognitive_load > t.cognitiveLoadMax) breaches.push(`cognitive load ${result.cognitive_load}`)
    if (result.manipulation_risk > t.manipulationRiskMax) breaches.push(`manipulation risk ${result.manipulation_risk}`)
    if (result.comprehension_confidence < t.comprehensionConfidenceMin) breaches.push(`comprehension ${result.comprehension_confidence}`)

    if (breaches.length > 0) {
      addAgentFeedEntry({
        action_type: 'THRESHOLD_BREACH',
        zone: 'RECOMMEND',
        status: 'executed',
        description: `Live score breached thresholds — ${breaches.join(', ')}. Review recommended.`,
      })
    } else {
      addAgentFeedEntry({
        action_type: 'PROMPT_EVALUATED',
        zone: 'OBSERVE',
        status: 'executed',
        description: `Live score: load ${result.cognitive_load} · comprehension ${result.comprehension_confidence} · manipulation ${result.manipulation_risk} · ${result.cognitive_risk} risk`,
      })
    }
  }

  return (
    <AppContext.Provider value={{
      evaluationQueue, auditLog, actGatedQueue, agentFeed, manipulationFeed,
      connectors, thresholds, killSwitchActive, killSwitchBanner, hasConnectedEndpoint,
      latestLiveScore, liveScoreTrend,
      addToEvaluationQueue, updateEvaluationItem, addAuditEntry, addActGatedItem,
      resolveActGatedItem, addAgentFeedEntry, addManipulationFeedEntry, updateConnector, updateThresholds,
      setKillSwitch, setKillSwitchBanner, setHasConnectedEndpoint, recordLiveScore,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  return useContext(AppContext)
}
