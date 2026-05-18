import express from 'express'
import { createEvalRouter } from './router.js'

const PORT = Number(process.env['PORT'] ?? 3002)

const app = express()
app.use(express.json({ limit: '10mb' }))
app.use('/', createEvalRouter())

app.listen(PORT, () => {
  console.log(JSON.stringify({ level: 'info', msg: 'eval-integration listening', port: PORT }))
})

export { app }

// Re-export adapters for library consumers
export { braintrustScorer, braintrustSingleScorer } from './adapters/BraintrustAdapter.js'
export { langfuseEvaluator, langfuseBatchEvaluator } from './adapters/LangfuseAdapter.js'
export { wandbScorer, wandbScoreOnly } from './adapters/WandBAdapter.js'
export { arizeEvaluator, toPhoenixEvalRecord } from './adapters/ArizeAdapter.js'
export { checkRegression, upsertBaseline, getBaseline } from './regressionGate.js'
export type { EvalScoreRequest, EvalScoreResponse, RegressionResult } from './types.js'
