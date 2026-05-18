import request from 'supertest'
import express from 'express'
import { MockScoringEngine } from '../engines/MockScoringEngine.js'
import { createScoreRouter } from '../routes/score.js'

const app = express()
app.use(express.json())
app.use('/score', createScoreRouter(new MockScoringEngine()))

describe('POST /score', () => {
  test('returns 200 with valid text request', async () => {
    const res = await request(app).post('/score').send({
      stimulus_type: 'text',
      content: 'Hello world.',
      workspace_id: 'ws-test',
    })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('cognitive_load')
    expect(res.body).toHaveProperty('model_version', 'mock-v1')
  })

  test('returns 400 on missing workspace_id', async () => {
    const res = await request(app).post('/score').send({
      stimulus_type: 'text',
      content: 'Hello world.',
    })
    expect(res.status).toBe(400)
  })

  test('returns 400 on invalid stimulus_type', async () => {
    const res = await request(app).post('/score').send({
      stimulus_type: 'invalid',
      content: 'Hello world.',
      workspace_id: 'ws-test',
    })
    expect(res.status).toBe(400)
  })

  test('responds within 600ms under sequential load', async () => {
    const start = Date.now()
    for (let i = 0; i < 20; i++) {
      await request(app).post('/score').send({
        stimulus_type: 'text',
        content: `Request number ${i}`,
        workspace_id: 'ws-test',
      })
    }
    const elapsed = Date.now() - start
    expect(elapsed / 20).toBeLessThan(600)
  })
})
