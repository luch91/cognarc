import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout.js'
import { WorkspaceOverview } from './views/WorkspaceOverview.js'
import { EngineerView } from './views/EngineerView.js'
import { PMView } from './views/PMView.js'
import { GrowthView } from './views/GrowthView.js'
import { DesignerView } from './views/DesignerView.js'
import { SafetyView } from './views/SafetyView.js'
import { ApprovalsView } from './views/ApprovalsView.js'
import { SettingsView } from './views/SettingsView.js'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<WorkspaceOverview />} />
        <Route path="engineer" element={<EngineerView />} />
        <Route path="pm" element={<PMView />} />
        <Route path="growth" element={<GrowthView />} />
        <Route path="designer" element={<DesignerView />} />
        <Route path="safety" element={<SafetyView />} />
        <Route path="approvals" element={<ApprovalsView />} />
        <Route path="settings" element={<SettingsView />} />
      </Route>
    </Routes>
  )
}
