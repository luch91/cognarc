from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import ExtractRequest, ExtractResponse
from extractor import extract_via_http

app = FastAPI(title="CognArc URL Content Extractor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "url-extractor"}


@app.post("/extract", response_model=ExtractResponse)
async def extract(request: ExtractRequest):
    if not request.url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="URL must start with http:// or https://"
        )

    blocked = ["localhost", "127.0.0.1", "0.0.0.0", "192.168.", "10.0."]
    if any(b in request.url for b in blocked):
        raise HTTPException(
            status_code=400,
            detail="Private or internal URLs are not supported"
        )

    try:
        result = await extract_via_http(request.url, request.max_sections)
        return result
    except Exception as e:
        error_msg = str(e)
        if "Connection refused" in error_msg or "ConnectError" in error_msg:
            raise HTTPException(status_code=422, detail="Could not reach this URL. Check the address and try again.")
        if "403" in error_msg or "Forbidden" in error_msg:
            raise HTTPException(status_code=422, detail="This page blocked our request. Try pasting the copy directly instead.")
        if "404" in error_msg:
            raise HTTPException(status_code=422, detail="Page not found (404). Check the URL and try again.")
        if "timeout" in error_msg.lower():
            raise HTTPException(status_code=422, detail="This page took too long to respond. Try again or paste the copy directly.")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {error_msg}")
