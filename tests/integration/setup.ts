// Polyfill globals needed by services under test
import { TextEncoder, TextDecoder } from 'util'

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder
  global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder
}

if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn() as unknown as typeof global.fetch
}

if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    ok = true
    status = 200
    async json() { return {} }
    async text() { return '' }
  } as unknown as typeof global.Response
}
