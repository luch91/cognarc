import { performance } from 'node:perf_hooks'
import { mkdirSync, writeFileSync } from 'node:fs'
import express from 'express'
import supertest from 'supertest'
import type { CognitiveScoreRequest, CognitiveScoreResponse } from '@cognarc/types'
import { MathematicalScoringEngine } from '../src/engines/MathematicalScoringEngine.js'
import { FallbackScoringEngine } from '../src/engines/FallbackScoringEngine.js'
import { ScoringEngine } from '../src/engines/ScoringEngine.js'
import { createScoreRouter } from '../src/routes/score.js'

/*
 * Reproducible offline benchmark. Performance and quality are separate:
 * numbers from this script are for local mathematical CME and in-process HTTP.
 * No real TRIBE, Supabase, Cloudflare, network, browser or production SLO is tested.
 */
const short='Save the draft. Review the changes before publishing.'
const complex='The interdisciplinary neurocomputational implementation requires systematic contextualisation and comprehensive methodological validation, including dependent processing stages.'
const pressure='Act now! Only 2 remaining. Experts agree. Guaranteed. Last chance! Review the details.'
const long=Array.from({length: 120}, (_,i)=>i%5===0?pressure:i%2===0?complex:short).join(' ')
const samples=[short,complex,pressure,long]
const base={workspace_id:'benchmark-offline',stimulus_type:'text' as const}
const engine=new MathematicalScoringEngine()
const percent=(values:number[],p:number):number=>{
  const sorted=[...values].sort((a,b)=>a-b)
  return Number(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]!.toFixed(3))
}
const timer=async <T>(fn:()=>Promise<T>):Promise<{ms:number;value:T}>=>{
  const t=performance.now()
  const value=await fn()
  return {ms:performance.now()-t,value}
}
const metrics=(name:string,values:number[],seconds:number,errors:number)=>({
  name,count:values.length,errors,
  requests_per_second:Number((values.length/seconds).toFixed(2)),
  latency_ms:{p50:percent(values,0.5),p95:percent(values,0.95),p99:percent(values,0.99),
    max:percent(values,1)},
  elapsed_s:Number(seconds.toFixed(3)),
})
function ensure(value:unknown,message:string):asserts value {
  if(!value)throw new Error('Benchmark assertion: '+message)
}

async function main(){
  const timestamp=new Date().toISOString()
  for(let i=0;i<60;i++)await engine.score({...base,content:samples[i%samples.length]!})
  const baseline=await engine.score({...base,content:short})
  const repeat=await engine.score({...base,content:short})
  for(const key of ['cognitive_load','comprehension_confidence','trust_coherence','manipulation_risk'] as const){
    ensure(baseline[key]===repeat[key],'non-deterministic '+key)
  }
  const flagged=await engine.score({...base,content:pressure})
  ensure(flagged.manipulation_risk>baseline.manipulation_risk,'pressure-language signal not discriminative')
  ensure(baseline.scoring_provenance?.engine==='mathematical' &&
    baseline.scoring_provenance.policy_eligible===false &&
    baseline.scoring_provenance.neural_evidence===false,'incorrect mathematical evidence provenance')
  let unsupportedRejected=false
  try{await engine.score({workspace_id:base.workspace_id,stimulus_type:'image',content:'fake-image'})}
  catch{unsupportedRejected=true}
  ensure(unsupportedRejected,'unsupported modality accepted')

  const direct:number[]=[]
  const directStart=performance.now()
  for(let i=0;i<600;i++){
    const {ms,value}=await timer(()=>engine.score({...base,content:samples[i%samples.length]!}))
    direct.push(ms)
    ensure(value.scoring_provenance?.policy_eligible===false,'mathematical policy eligibility invalid')
  }
  const directElapsed=(performance.now()-directStart)/1000

  const app=express()
  app.use(express.json({limit:'64kb'}))
  app.use('/score',createScoreRouter(engine))
  const client=supertest(app)
  const request=async(i:number)=>{
    const {ms,value}=await timer(()=>client.post('/score').send({...base,content:samples[i%samples.length]!}))
    ensure(value.status===200,'HTTP score response '+value.status)
    ensure(value.body.scoring_provenance?.engine==='mathematical','HTTP provenance')
    return ms
  }
  for(let i=0;i<15;i++)await request(i)
  const sequential:number[]=[]
  const seqStart=performance.now()
  for(let i=0;i<100;i++)sequential.push(await request(i))
  const seqElapsed=(performance.now()-seqStart)/1000

  const parallel:number[]=[]
  const parStart=performance.now()
  for(let offset=0;offset<160;offset+=16){
    const batch=await Promise.all(Array.from({length:16},(_,j)=>request(offset+j)))
    parallel.push(...batch)
  }
  const parElapsed=(performance.now()-parStart)/1000

  class Offline extends ScoringEngine {
    readonly engineName='tribe-offline'
    async score(_request:CognitiveScoreRequest):Promise<CognitiveScoreResponse> {
      throw new Error('TRIBE_TIMEOUT')
    }
  }
  const failover=new FallbackScoringEngine(new Offline())
  const fallbacks:number[]=[]
  const fbStart=performance.now()
  for(let i=0;i<100;i++){
    const {ms,value}=await timer(()=>failover.score({...base,content:samples[i%samples.length]!}))
    ensure(value.scoring_provenance?.fallback_used===true &&
      value.scoring_provenance.fallback_reason==='TRIBE_TIMEOUT' &&
      value.scoring_provenance.policy_eligible===false,'fallback provenance inaccurate')
    fallbacks.push(ms)
  }
  const fbElapsed=(performance.now()-fbStart)/1000

  const result={
    benchmark:'cognarc-mathematical-cme-offline',
    recorded_at:timestamp,
    runtime:{node:process.version,platform:process.platform,architecture:process.arch,
      cpus:Number(process.env.RUNNER_CPU_COUNT??0)||null},
    disclaimer:'CI runner, in-process Express, no network TRIBE, Cloudflare, database or human calibration',
    assertions:{deterministic:true,pressure_signal:true,unsupported_modality_denied:true,
      mathematical_policy_ineligible:true,timeout_fallback_explicit:true},
    metrics:[
      metrics('direct_math_600_mixed',direct,directElapsed,0),
      metrics('in_process_http_100_sequential',sequential,seqElapsed,0),
      metrics('in_process_http_160_batched_16',parallel,parElapsed,0),
      metrics('offline_tribe_timeout_fallback_100',fallbacks,fbElapsed,0),
    ],
    heap_used_mb:Number((process.memoryUsage().heapUsed/1048576).toFixed(2)),
  }
  mkdirSync('reports',{recursive:true})
  writeFileSync('reports/performance.json',JSON.stringify(result,null,2)+'\n')
  console.log('COGNARC_BENCHMARK_JSON='+JSON.stringify(result))
  // Guard very large regressions, not production latency targets.
  ensure(percent(direct,0.95)<500,'direct mathematical scorer p95 exceeded 500ms')
  ensure(percent(sequential,0.95)<2500,'local HTTP scorer p95 exceeded 2500ms')
  ensure(percent(parallel,0.95)<3500,'local batched HTTP scorer p95 exceeded 3500ms')
}

main().catch(error=>{console.error(error);process.exitCode=1})
