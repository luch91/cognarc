// Polyfill Web APIs missing from jsdom
import { TextEncoder, TextDecoder } from 'util'

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder
  global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder
}

// Minimal Response stub — tests only need new Response() as a mock resolved value
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    ok = true
    status = 200
    async json() { return {} }
    async text() { return '' }
  } as unknown as typeof global.Response
}

if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn() as unknown as typeof global.fetch
}
