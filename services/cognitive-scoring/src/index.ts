import express from 'express'
import { env } from './config/env.js'
import { createScoringEngine } from './engines/factory.js'
import { createScoreRouter } from './routes/score.js'
import { createABRouter } from './ab-engine/router.js'

const app = express()
app.use(express.json({ limit: '50mb' }))

const engine = createScoringEngine()
app.use('/score', createScoreRouter(engine))
app.use('/ab-compare', createABRouter(engine))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', engine: engine.engineName })
})

app.listen(env.PORT, () => {
  console.log(
    JSON.stringify({ level: 'info', msg: `cognitive-scoring listening`, port: env.PORT, engine: engine.engineName }),
  )
})

export { app }
