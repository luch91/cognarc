import express from 'express'
import { Pool } from 'pg'
import Redis from 'ioredis'
import { env } from './config/env.js'
import { TrustGradientEngine } from './TrustGradientEngine.js'
import { AuditLog } from './AuditLog.js'
import { GlobalKillSwitch } from './GlobalKillSwitch.js'
import { ActGatedWorkflow } from './ActGatedWorkflow.js'
import { createRouter } from './routes/index.js'

const pool = new Pool({ connectionString: env.COGNARC_DB_URL })
const redis = new Redis(env.COGNARC_REDIS_URL)
const engine = new TrustGradientEngine()
const auditLog = new AuditLog(pool)
const killSwitch = new GlobalKillSwitch(redis)
const actGated = new ActGatedWorkflow()

const app = express()
app.use(express.json())
app.use('/', createRouter({ engine, auditLog, killSwitch, actGated }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(env.PORT, () => {
  console.log(
    JSON.stringify({ level: 'info', msg: 'trust-gradient listening', port: env.PORT }),
  )
})

export { app, engine, auditLog, killSwitch, actGated }
