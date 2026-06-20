import re


def clean_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    boilerplate = [
        "cookie", "privacy policy", "terms of service",
        "all rights reserved", "©", "subscribe to our newsletter",
        "follow us on", "accept cookies"
    ]
    for phrase in boilerplate:
        if phrase.lower() in text.lower() and len(text) < 80:
            return ""
    return text


def is_meaningful(text: str, min_words: int = 3) -> bool:
    words = text.split()
    if len(words) < min_words:
        return False
    if text.count('|') > 3 or text.count('·') > 3:
        return False
    return True


def deduplicate(sections: list[dict]) -> list[dict]:
    seen: set[str] = set()
    unique = []
    for section in sections:
        key = ' '.join(section['text'].lower().split()[:8])
        if key not in seen:
            seen.add(key)
            unique.append(section)
    return unique
