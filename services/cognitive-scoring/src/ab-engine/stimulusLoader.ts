import { tmpdir } from 'os'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import type { Stimulus } from './types.js'

const RENDER_TIMEOUT_MS = 30_000
const ROBOTS_UA = 'CognArcBot/1.0 (+https://cognarc.ai/bot)'

/**
 * Normalise any Stimulus into a form ready for the scoring engine:
 *   - text  → { type: 'text', content: string }
 *   - image → { type: 'image', content: Buffer }
 *   - html  → screenshot via Puppeteer → { type: 'image', content: Buffer }
 *   - url   → fetch HTML, respect robots.txt, screenshot → { type: 'image', content: Buffer }
 *
 * Returns the normalised stimulus AND the raw text extracted from HTML/URL inputs
 * so the mock engine (text-based) can score it without needing real vision.
 */
export interface NormalisedStimulus {
  scorerInput: Stimulus
  extractedText: string
  screenshotPath?: string   // path written to /tmp for debugging
}

export async function normaliseStimulus(stimulus: Stimulus): Promise<NormalisedStimulus> {
  switch (stimulus.type) {
    case 'text':
      return { scorerInput: stimulus, extractedText: String(stimulus.content) }

    case 'image': {
      const buf = stimulus.content instanceof Buffer
        ? stimulus.content
        : Buffer.from(String(stimulus.content), 'base64')
      return { scorerInput: { ...stimulus, content: buf }, extractedText: '' }
    }

    case 'html': {
      const html = String(stimulus.content)
      const extracted = extractTextFromHtml(html)
      const screenshot = await renderHtmlToScreenshot(html)
      return { scorerInput: screenshot.stimulus, extractedText: extracted, screenshotPath: screenshot.path }
    }

    case 'url': {
      const url = String(stimulus.content)
      await checkRobotsTxt(url)
      const html = await fetchUrl(url)
      const extracted = extractTextFromHtml(html)
      const screenshot = await renderHtmlToScreenshot(html)
      return { scorerInput: screenshot.stimulus, extractedText: extracted, screenshotPath: screenshot.path }
    }

    default: {
      const _: never = stimulus.type
      throw new Error(`Unknown stimulus type: ${_}`)
    }
  }
}

function extractTextFromHtml(html: string): string {
  // Strip tags and collapse whitespace — good enough for mock scoring
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function renderHtmlToScreenshot(
  html: string,
): Promise<{ stimulus: Stimulus; path: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let puppeteer: any
  try {
    // Dynamic import with `any` avoids the ESM/CJS resolution-mode error when
    // the service package.json does not declare "type": "module".
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    puppeteer = await import('puppeteer')
  } catch {
    // Puppeteer not installed — fall back to scoring extracted text
    const text = extractTextFromHtml(html)
    return { stimulus: { type: 'text', content: text }, path: '' }
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    await Promise.race([
      page.setContent(html, { waitUntil: 'load' }),
      timeout(RENDER_TIMEOUT_MS),
    ])

    const screenshotBuf = await page.screenshot({ type: 'png', fullPage: false })
    const buf = Buffer.isBuffer(screenshotBuf) ? screenshotBuf : Buffer.from(screenshotBuf)

    // Save to /tmp for debugging
    const filename = `cognarc-ab-${Date.now()}.png`
    const screenshotPath = join(tmpdir(), filename)
    await writeFile(screenshotPath, buf)

    return {
      stimulus: { type: 'image', content: buf },
      path: screenshotPath,
    }
  } finally {
    await browser.close()
  }
}

async function checkRobotsTxt(rawUrl: string): Promise<void> {
  try {
    const parsed = new URL(rawUrl)
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': ROBOTS_UA },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return  // no robots.txt → proceed

    const text = await res.text()
    const disallowedForAll = parseDisallowed(text, '*')
    const disallowedForBot = parseDisallowed(text, 'CognArcBot')
    const path = new URL(rawUrl).pathname

    const blocked = [...disallowedForAll, ...disallowedForBot].some((p) => path.startsWith(p))
    if (blocked) {
      throw new Error(`robots.txt disallows crawling ${rawUrl}`)
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('robots.txt')) throw err
    // fetch errors (DNS failure etc) → proceed
  }
}

function parseDisallowed(robotsTxt: string, agent: string): string[] {
  const lines = robotsTxt.split('\n').map((l) => l.trim())
  const disallowed: string[] = []
  let inBlock = false

  for (const line of lines) {
    if (line.toLowerCase().startsWith('user-agent:')) {
      const ua = line.slice('user-agent:'.length).trim()
      inBlock = ua === '*' || ua.toLowerCase() === agent.toLowerCase()
      continue
    }
    if (inBlock && line.toLowerCase().startsWith('disallow:')) {
      const path = line.slice('disallow:'.length).trim()
      if (path) disallowed.push(path)
    }
    // Empty line ends the block
    if (line === '') inBlock = false
  }

  return disallowed
}

async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': ROBOTS_UA },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.text()
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Rendering timed out after ${ms}ms`)), ms),
  )
}
