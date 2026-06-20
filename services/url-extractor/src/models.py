from pydantic import BaseModel
from typing import Optional


class ExtractRequest(BaseModel):
    url: str
    workspace_id: str
    include_metadata: bool = True
    max_sections: int = 10


class ContentSection(BaseModel):
    section_type: str
    label: str
    text: str
    element: str
    word_count: int
    score_this: bool


class ExtractResponse(BaseModel):
    url: str
    page_title: str
    meta_description: Optional[str]
    sections: list[ContentSection]
    total_word_count: int
    extraction_method: str
    fetch_time_ms: int
    warning: Optional[str]
