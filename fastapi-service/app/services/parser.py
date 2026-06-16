import io
import json
from pypdf import PdfReader
from docx import Document

def parse_document(file_bytes: bytes, filename: str) -> list:
    """
    Parses document bytes based on filename extension.
    Returns a list of dictionaries with text content and page numbers:
    [{"text": "page content", "page_number": 1}]
    """
    ext = filename.split(".")[-1].lower()
    pages = []

    if ext == "pdf":
        pdf_file = io.BytesIO(file_bytes)
        reader = PdfReader(pdf_file)
        for idx, page in enumerate(reader.pages):
            text = page.extract_text()
            if text and text.strip():
                pages.append({
                    "text": text.strip(),
                    "page_number": idx + 1
                })

    elif ext == "docx":
        docx_file = io.BytesIO(file_bytes)
        doc = Document(docx_file)
        # Extract all non-empty paragraphs
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        full_text = "\n".join(paragraphs)
        if full_text:
            pages.append({
                "text": full_text,
                "page_number": 1
            })

    elif ext == "json":
        try:
            json_str = file_bytes.decode("utf-8")
            data = json.loads(json_str)
            formatted_text = json.dumps(data, indent=2)
            pages.append({
                "text": formatted_text,
                "page_number": 1
            })
        except Exception as e:
            # Fallback in case of decoding errors
            pages.append({
                "text": file_bytes.decode("utf-8", errors="ignore"),
                "page_number": 1
            })
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

    return pages
