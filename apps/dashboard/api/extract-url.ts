import type { VercelRequest, VercelResponse } from '@vercel/node'

interface Section {
  section_type: string
  label: string
  text: string
  element: string
  word_count: number
  score_this: boolean
}

function extractTextFromHtml(html: string, url: string): { pageTitle: string; metaDescription: string | null; sections: Section[] } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const pageTitle = titleMatch ? titleMatch[1]!.trim().replace(/\s+/g, ' ') : url

  const metaMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i)
  const metaDescription = metaMatch ? metaMatch[1]!.trim() : null

  function stripTags(s: string): string {
    return s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  }

  const seen = new Set<string>()
  const sections: Section[] = []

  if (metaDescription) {
    sections.push({
      section_type: 'meta',
      label: 'Meta Description',
      text: metaDescription,
      element: 'meta',
      word_count: metaDescription.split(/\s+/).length,
      score_this: true,
    })
    seen.add(metaDescription.toLowerCase())
  }

  const h1Matches = html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)
  for (const m of h1Matches) {
    const text = stripTags(m[1]!)
    if (text.length < 3 || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    sections.push({
      section_type: 'hero',
      label: 'Main Headline',
      text,
      element: 'h1',
      word_count: text.split(/\s+/).length,
      score_this: true,
    })
  }

  const h2Matches = html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)
  for (const m of h2Matches) {
    const text = stripTags(m[1]!)
    if (text.length < 3 || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    sections.push({
      section_type: 'headline',
      label: 'Section Heading',
      text,
      element: 'h2',
      word_count: text.split(/\s+/).length,
      score_this: true,
    })
  }

  const pMatches = html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)
  for (const m of pMatches) {
    const text = stripTags(m[1]!)
    if (text.length < 20 || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    const isHero = sections.length < 3
    sections.push({
      section_type: isHero ? 'value_prop' : 'body',
      label: isHero ? 'Value Proposition' : 'Body Copy',
      text,
      element: 'p',
      word_count: text.split(/\s+/).length,
      score_this: text.split(/\s+/).length >= 5,
    })
  }

  const btnMatches = html.matchAll(/<(?:a|button)[^>]*>([\s\S]*?)<\/(?:a|button)>/gi)
  for (const m of btnMatches) {
    const fullTag = m[0]!.toLowerCase()
    if (!fullTag.includes('btn') && !fullTag.includes('button') && !fullTag.includes('cta') && !fullTag.includes('submit')) continue
    const text = stripTags(m[1]!)
    if (text.length < 2 || text.length > 80 || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    sections.push({
      section_type: 'cta',
      label: 'Call to Action',
      text,
      element: 'button',
      word_count: text.split(/\s+/).length,
      score_this: true,
    })
  }

  return { pageTitle, metaDescription, sections: sections.slice(0, 15) }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = req.body as Record<string, unknown> | undefined
  const url = body?.url as string | undefined
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    res.status(400).json({ detail: 'Missing or invalid url' })
    return
  }

  try {
    const start = Date.now()
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CognArc-Analyser/1.0 (https://cognarc.ai)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    })

    if (!response.ok) {
      res.status(502).json({ detail: `Page returned HTTP ${response.status}` })
      return
    }

    const html = await response.text()
    const { pageTitle, metaDescription, sections } = extractTextFromHtml(html, url)
    const totalWordCount = sections.reduce((sum, s) => sum + s.word_count, 0)

    res.status(200).json({
      url,
      page_title: pageTitle,
      meta_description: metaDescription,
      sections,
      total_word_count: totalWordCount,
      extraction_method: 'http',
      fetch_time_ms: Date.now() - start,
      warning: sections.length < 3
        ? 'Few text sections found — the page may use heavy JavaScript rendering. Results may be incomplete.'
        : null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch page'
    res.status(502).json({ detail: message })
  }
}
