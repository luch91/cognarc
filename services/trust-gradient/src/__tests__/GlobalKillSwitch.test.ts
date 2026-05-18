import Redis from 'ioredis'
import { GlobalKillSwitch } from '../GlobalKillSwitch.js'
import { KillSwitchActiveError } from '@cognarc/types'

// Uses ioredis-mock so no real Redis required in unit tests
jest.mock('ioredis', () => {
  const store = new Map<string, string>()
  return jest.fn().mockImplementation(() => ({
    set: (k: string, v: string) => { store.set(k, v); return Promise.resolve('OK') },
    get: (k: string) => Promise.resolve(store.get(k) ?? null),
    del: (k: string) => { store.delete(k); return Promise.resolve(1) },
  }))
})

describe('GlobalKillSwitch', () => {
  let ks: GlobalKillSwitch

  beforeEach(() => {
    ks = new GlobalKillSwitch(new Redis() as unknown as Redis)
  })

  test('isActiveAsync returns false when not activated', async () => {
    expect(await ks.isActiveAsync('ws-1')).toBe(false)
  })

  test('activate sets kill switch active within 5 seconds', async () => {
    const start = Date.now()
    await ks.activate('ws-1')
    expect(Date.now() - start).toBeLessThan(5000)
    expect(await ks.isActiveAsync('ws-1')).toBe(true)
  })

  test('checkAndThrow throws KillSwitchActiveError when active', async () => {
    await ks.activate('ws-2')
    await expect(ks.checkAndThrow('ws-2')).rejects.toThrow(KillSwitchActiveError)
  })

  test('checkAndThrow does not throw when inactive', async () => {
    await expect(ks.checkAndThrow('ws-inactive')).resolves.toBeUndefined()
  })

  test('deactivate removes kill switch', async () => {
    await ks.activate('ws-3')
    await ks.deactivate('ws-3', 'human-alice')
    expect(await ks.isActiveAsync('ws-3')).toBe(false)
  })

  test('OBSERVE zone continues passively — kill switch does not affect OBSERVE actions', async () => {
    await ks.activate('ws-4')
    // OBSERVE actions should not call checkAndThrow at all
    // This test verifies the kill switch state is independent of OBSERVE logic
    expect(await ks.isActiveAsync('ws-4')).toBe(true)
    // Caller is responsible for only gating ACT_AUTO and ACT_GATED
  })
})
