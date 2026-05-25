import { useState, useEffect } from 'react'

const APP_URL = 'https://cognarc-dashboard.vercel.app'

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-navy-900/95 backdrop-blur-md border-b border-white/[0.08] shadow-xl shadow-black/20'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-1 group"
          >
            <span className="text-xl font-bold text-white tracking-tight">CognArc</span>
            <span className="w-2 h-2 rounded-full bg-teal-400 group-hover:bg-teal-300 transition-colors mt-0.5 ml-0.5" />
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: 'Product', id: 'how-it-works' },
              { label: 'Use Cases', id: 'use-cases' },
              { label: 'Pricing', id: 'pricing' },
              { label: 'Docs', id: 'how-it-works' },
            ].map(({ label, id }) => (
              <button
                key={label}
                onClick={() => scrollTo(id)}
                className="btn-ghost text-sm"
              >
                {label}
              </button>
            ))}
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => scrollTo('waitlist')}
              className="btn-ghost text-sm"
            >
              Early Access
            </button>
            <a
              href={APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm py-2 px-5"
            >
              Try It Free
            </a>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-slate-300 hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <div className="w-5 h-4 flex flex-col justify-between">
              <span className={`block h-0.5 bg-current transition-all ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
              <span className={`block h-0.5 bg-current transition-all ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 bg-current transition-all ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-navy-900/98 border-t border-white/[0.08] px-4 py-4 space-y-1">
          {[
            { label: 'Product', id: 'how-it-works' },
            { label: 'Use Cases', id: 'use-cases' },
            { label: 'Pricing', id: 'pricing' },
          ].map(({ label, id }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="block w-full text-left px-3 py-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              {label}
            </button>
          ))}
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full btn-primary text-sm mt-3 text-center"
          >
            Try It Free
          </a>
        </div>
      )}
    </header>
  )
}
