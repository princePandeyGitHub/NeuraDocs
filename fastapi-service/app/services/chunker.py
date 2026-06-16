def split_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> list[str]:
    """
    Splits a string of text into overlapping chunks recursively using
    natural separators like double newlines, single newlines, spaces, and characters.
    """
    if len(text) <= chunk_size:
        return [text]

    # Find the best separator to split on
    separators = ["\n\n", "\n", " ", ""]
    separator = ""
    for sep in separators:
        if sep in text:
            separator = sep
            break

    splits = text.split(separator) if separator != "" else list(text)
    
    chunks = []
    current_chunk = []
    current_len = 0

    for split in splits:
        split_len = len(split) + (len(separator) if current_chunk else 0)
        
        if current_len + split_len > chunk_size:
            if current_chunk:
                chunks.append(separator.join(current_chunk))
            
            # Rebuild overlap
            overlap_chunk = []
            overlap_len = 0
            for item in reversed(current_chunk):
                item_len = len(item) + (len(separator) if overlap_chunk else 0)
                if overlap_len + item_len <= chunk_overlap:
                    overlap_chunk.insert(0, item)
                    overlap_len += item_len
                else:
                    break
            
            current_chunk = overlap_chunk
            current_len = overlap_len
            
        current_chunk.append(split)
        current_len += split_len

    if current_chunk:
        chunks.append(separator.join(current_chunk))

    return chunks


def chunk_document_pages(pages: list, chunk_size: int = 1000, chunk_overlap: int = 200) -> list:
    """
    Takes parsed pages: [{"text": "...", "page_number": 1}]
    And chunks them: [{"content": "...", "page_number": 1}]
    """
    chunks = []
    for page in pages:
        page_text = page["text"]
        page_num = page["page_number"]
        
        split_chunks = split_text(page_text, chunk_size, chunk_overlap)
        for chunk in split_chunks:
            if chunk.strip():
                chunks.append({
                    "content": chunk.strip(),
                    "page_number": page_num
                })
                
    return chunks
