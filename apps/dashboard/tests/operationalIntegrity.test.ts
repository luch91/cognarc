import {
  fetchHealthTrend, fetchSurfaces, fetchPromptBaselines, fetchCicdRuns,
  fetchAlignmentTrend, fetchModelProfiles, fetchCreativeAssets,
  fetchRemediations, fetchActGatedItems, fetchAuditLog,
  approveActGated, rejectActGated, setKillSwitch, fetchKillSwitch,
} from '../src/api/mock.js'

describe('Gate 2 fail-closed admin data sources', () => {
  test('never supplies example records as current workspace data', async () => {
    const values = await Promise.all([
      fetchHealthTrend(), fetchSurfaces(), fetchPromptBaselines(),
      fetchCicdRuns(), fetchAlignmentTrend(), fetchModelProfiles(),
      fetchCreativeAssets(), fetchRemediations(), fetchActGatedItems(),
      fetchAuditLog(),
    ])
    expect(values.every(value => Array.isArray(value) && value.length === 0)).toBe(true)
  })

  test('cannot approve, reject or activate controls through in-memory mocks', async () => {
    await expect(approveActGated('example', 'because')).rejects.toThrow('unavailable')
    await expect(rejectActGated('example', 'because')).rejects.toThrow('unavailable')
    await expect(setKillSwitch(true)).rejects.toThrow('unavailable')
    await expect(fetchKillSwitch()).rejects.toThrow('unavailable')
  })
})
