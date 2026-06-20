const EXTRACTOR_URL = (import.meta.env.VITE_URL_EXTRACTOR_URL as string | undefined)
  ?? 'http://localhost:3008'

export interface ContentSection {
  sectionType: 'hero' | 'headline' | 'value_prop' | 'body' | 'cta' |
               'nav' | 'footer' | 'meta' | 'feature'
  label: string
  text: string
  element: string
  wordCount: number
  scoreThis: boolean
}

export interface ExtractResponse {
  url: string
  pageTitle: string
  metaDescription: string | null
  sections: ContentSection[]
  totalWordCount: number
  extractionMethod: 'http' | 'headless'
  fetchTimeMs: number
  warning: string | null
}

export async function extractUrl(
  url: string,
  workspaceId: string,
  maxSections: number = 10
): Promise<ExtractResponse> {
  const res = await fetch(`${EXTRACTOR_URL}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      workspace_id: workspaceId,
      max_sections: maxSections,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail ?? `Extraction failed: ${res.status}`)
  }

  const data = await res.json()

  return {
    url: data.url,
    pageTitle: data.page_title,
    metaDescription: data.meta_description,
    sections: (data.sections as Record<string, unknown>[]).map((s) => ({
      sectionType: s.section_type as ContentSection['sectionType'],
      label: s.label as string,
      text: s.text as string,
      element: s.element as string,
      wordCount: s.word_count as number,
      scoreThis: s.score_this as boolean,
    })),
    totalWordCount: data.total_word_count,
    extractionMethod: data.extraction_method,
    fetchTimeMs: data.fetch_time_ms,
    warning: data.warning,
  }
}
