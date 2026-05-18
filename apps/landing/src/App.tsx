import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Problem } from './components/Problem'
import { HowItWorks } from './components/HowItWorks'
import { UseCases } from './components/UseCases'
import { TrustGradient } from './components/TrustGradient'
import { Pricing } from './components/Pricing'
import { Waitlist } from './components/Waitlist'
import { Footer } from './components/Footer'

export default function App() {
  return (
    <div className="min-h-screen bg-navy-900 text-white">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <UseCases />
        <TrustGradient />
        <Pricing />
        <Waitlist />
      </main>
      <Footer />
    </div>
  )
}
