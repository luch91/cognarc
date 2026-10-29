import express, { type Application } from 'express'
import { env } from './config/env.js'
import { createScoringEngine } from './engines/factory.js'
import { createScoreRouter } from './routes/score.js'
import { createABRouter } from './ab-engine/router.js'

const app: Application = express()
app.use(express.json({ limit: '50mb' }))

const engine = createScoringEngine()
app.use('/score', createScoreRouter(engine))
app.use('/ab-compare', createABRouter(engine))

app.get('/health', (_req, res) => {
  // A production instance without gateway authentication must not advertise
  // readiness while its actual scoring endpoint refuses requests.
  const ready = env.NODE_ENV !== 'production' || Boolean(process.env.COGNARC_SCORING_SERVICE_SECRET)
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'unavailable',
    engine: engine.engineName,
  })
})

app.listen(env.PORT, () => {
  console.log(
    JSON.stringify({ level: 'info', msg: `cognitive-scoring listening`, port: env.PORT, engine: engine.engineName }),
  )
})

export { app }
