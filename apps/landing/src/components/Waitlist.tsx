import { useState } from 'react'

const APP_URL = 'http://localhost:5173'

type Role = 'Engineer' | 'PM' | 'Growth' | 'Designer' | 'Red Team' | 'Other'
const ROLES: Role[] = ['Engineer', 'PM', 'Growth', 'Designer', 'Red Team', 'Other']

interface WaitlistEntry {
  email: string
  role: Role
  joinedAt: string
}

function getExistingEntry(): WaitlistEntry | null {
  try {
    const raw = localStorage.getItem('cognarc_waitlist')
    return raw ? (JSON.parse(raw) as WaitlistEntry) : null
  } catch {
    return null
  }
}

export function Waitlist() {
  const existing = getExistingEntry()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [submitted, setSubmitted] = useState(!!existing)
  const [error, setError] = useState('')
  const [focused, setFocused] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      return
    }
    if (!role) {
      setError('Please select your role.')
      return
    }

    const entry: WaitlistEntry = { email, role, joinedAt: new Date().toISOString() }
    localStorage.setItem('cognarc_waitlist', JSON.stringify(entry))
    setSubmitted(true)
  }

  return (
    <section id="waitlist" className="relative py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />

      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-teal-500/6 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-2xl mx-auto text-center">
        <p className="section-label mb-4">Early Access</p>
        <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
          Ship with{' '}
          <span className="gradient-text">cognitive confidence.</span>
        </h2>
        <p className="text-slate-400 text-lg mb-6">
          The Developer tier is free, no credit card needed.{' '}
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-400 hover:text-teal-300 underline underline-offset-2 transition-colors"
          >
            Open the app now
          </a>{' '}
          or join the waitlist for early access to Growth &amp; Business features.
        </p>

        {submitted ? (
          <div className="card-glass rounded-2xl p-10 border border-teal-500/25">
            <div className="w-14 h-14 bg-teal-500/15 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-white text-2xl font-bold mb-2">You&apos;re on the list.</h3>
            <p className="text-slate-400 mb-4">
              We&apos;ll reach out to <span className="text-white font-medium">{existing?.email ?? email}</span> when early access opens.
            </p>
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 btn-primary text-sm mb-4"
            >
              Try the Developer tier now — it&apos;s free
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <p className="text-slate-500 text-sm">No spam. No sharing. Just CognArc updates.</p>
          </div>
        ) : (
          <div className="card-glass rounded-2xl p-8 border border-white/[0.08]">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="you@company.com"
                  className={`w-full bg-white/[0.06] border rounded-xl px-4 py-3 text-white placeholder:text-slate-500
                             outline-none transition-all duration-200 text-sm ${
                               focused ? 'border-teal-500/60 ring-2 ring-teal-500/20' : 'border-white/[0.12]'
                             }`}
                />
              </div>

              {/* Role picker */}
              <div>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all duration-150 ${
                        role === r
                          ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                          : 'bg-white/[0.04] border-white/[0.10] text-slate-400 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-red-400 text-sm text-left">{error}</p>
              )}

              <button
                type="submit"
                className="w-full btn-primary py-3 text-sm"
              >
                Join the Waitlist
              </button>
            </form>

            <p className="text-slate-500 text-xs mt-4">
              No spam. No sharing. Just CognArc updates.
            </p>
          </div>
        )}

        {/* Trust badge */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
          <span>Backed by</span>
          <span className="text-slate-400 font-medium">TRIBE v2 · Meta AI Research</span>
          <span>·</span>
          <span>CC-BY-NC-4.0 license</span>
        </div>
      </div>
    </section>
  )
}
