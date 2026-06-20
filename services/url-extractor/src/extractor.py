import httpx
import time
from bs4 import BeautifulSoup
from models import ContentSection, ExtractResponse
from cleaner import clean_text, is_meaningful, deduplicate

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}


def classify_element(tag_name: str, text: str, classes: list[str]) -> tuple[str, str, bool]:
    classes_str = ' '.join(classes).lower()
    text_lower = text.lower()

    if tag_name in ['nav'] or any(c in classes_str for c in ['nav', 'menu', 'header-nav']):
        return "nav", "Navigation", False

    if tag_name in ['footer'] or 'footer' in classes_str:
        return "footer", "Footer", False

    if tag_name == 'h1':
        return "hero", "Hero Headline", True

    if tag_name == 'h2':
        if any(word in text_lower for word in ['feature', 'benefit', 'how', 'why', 'what']):
            return "feature", f"Feature: {text[:40]}", True
        return "headline", "Section Headline", True

    if tag_name == 'h3':
        return "headline", "Sub-headline", True

    if tag_name in ['button', 'a'] or any(c in classes_str for c in ['btn', 'button', 'cta']):
        if len(text.split()) <= 8:
            return "cta", "CTA Button", True
        return "cta", "CTA Link", True

    if tag_name == 'meta':
        return "meta", "Meta Description", True

    if tag_name == 'p' and len(text.split()) < 50:
        if any(c in classes_str for c in ['hero', 'subtitle', 'tagline', 'subheadline', 'lead']):
            return "value_prop", "Value Proposition", True
        return "value_prop", "Short Paragraph", True

    if tag_name == 'p':
        return "body", "Body Copy", True

    if tag_name in ['li']:
        return "feature", "Feature / Benefit", True

    return "body", "Content", True


async def extract_via_http(url: str, max_sections: int = 10) -> ExtractResponse:
    start = time.time()

    async with httpx.AsyncClient(
        headers=HEADERS,
        follow_redirects=True,
        timeout=15.0
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        html = response.text

    fetch_ms = int((time.time() - start) * 1000)

    soup = BeautifulSoup(html, 'html.parser')

    for tag in soup(['script', 'style', 'noscript', 'iframe', 'svg', 'img']):
        tag.decompose()

    title_tag = soup.find('title')
    page_title = clean_text(title_tag.get_text()) if title_tag else "Untitled page"

    meta_desc = None
    meta_tag = soup.find('meta', attrs={'name': 'description'})
    if meta_tag:
        content = meta_tag.get('content', '')
        meta_desc = clean_text(content) if content else None

    raw_sections: list[dict] = []

    if meta_desc and is_meaningful(meta_desc):
        raw_sections.append({
            "section_type": "meta",
            "label": "Meta Description",
            "text": meta_desc,
            "element": "meta",
            "word_count": len(meta_desc.split()),
            "score_this": True,
        })

    priority_selectors = [
        'h1', 'h2', 'h3',
        'p', 'li',
        'button', 'a[class*="btn"]', 'a[class*="cta"]',
        '[class*="hero"] p', '[class*="subtitle"]',
        '[class*="tagline"]', '[class*="lead"]',
    ]

    seen_texts: set[str] = set()

    for selector in priority_selectors:
        tags = soup.select(selector)
        for tag in tags:
            text = clean_text(tag.get_text(separator=' '))
            if not text or not is_meaningful(text):
                continue
            key = ' '.join(text.lower().split()[:6])
            if key in seen_texts:
                continue
            seen_texts.add(key)

            tag_name = tag.name
            classes = tag.get('class', [])
            section_type, label, score_this = classify_element(
                tag_name, text, classes
            )

            raw_sections.append({
                "section_type": section_type,
                "label": label,
                "text": text,
                "element": tag_name,
                "word_count": len(text.split()),
                "score_this": score_this,
            })

    unique = deduplicate(raw_sections)[:max_sections]
    sections = [ContentSection(**s) for s in unique]

    total_words = sum(s.word_count for s in sections if s.score_this)

    warning = None
    if total_words < 50:
        warning = (
            "Very little text was extracted. This page may require "
            "JavaScript rendering. Try pasting the copy directly if "
            "URL results seem incomplete."
        )

    return ExtractResponse(
        url=url,
        page_title=page_title,
        meta_description=meta_desc,
        sections=sections,
        total_word_count=total_words,
        extraction_method="http",
        fetch_time_ms=fetch_ms,
        warning=warning,
    )
