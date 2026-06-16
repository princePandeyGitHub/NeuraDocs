import httpx
import logging
from app.config import GROQ_API_KEY, GROQ_API_URL, LLM_MODEL

logger = logging.getLogger(__name__)

# Standard prompt instructing the model to rely solely on context and cite sources
SYSTEM_PROMPT_TEMPLATE = """You are NeuraDocs AI, a secure and intelligent assistant for organization documents.
You must answer the user's query using ONLY the provided context blocks. 
If the answer cannot be found or inferred from the provided context blocks, state clearly that you don't know or that the context does not contain this information. Do not invent answers.

For each fact you state, you MUST cite the source document filename and page number from the context blocks using bracketed notation, e.g., [filename, Page X] or [filename, Page 1] if page number is not specified.

Context Blocks:
{context_text}
"""

async def generate_response(query: str, chunks: list, history: list) -> str:
    """
    Generates a RAG response using Groq's Llama 3.1 8B model.
    Injects context chunks into the system prompt and includes previous chat history.
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY environment variable is not configured.")

    # 1. Format context text
    context_blocks = []
    for idx, chunk in enumerate(chunks):
        filename = chunk.get("filename", "Unknown Document")
        page_num = chunk.get("page_number")
        page_str = f"Page {page_num}" if page_num else "Page 1"
        
        block_header = f"--- BLOCK {idx + 1} (Source: {filename}, {page_str}) ---"
        context_blocks.append(f"{block_header}\n{chunk.get('content', '')}")
    
    context_text = "\n\n".join(context_blocks)
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(context_text=context_text)

    # 2. Assemble messages payload
    messages = [{"role": "system", "content": system_prompt}]
    
    # Append chat history (role must be 'user' or 'assistant')
    for message in history:
        messages.append({
            "role": message.get("role"),
            "content": message.get("content")
        })
        
    # Append current user query
    messages.append({"role": "user", "content": query})

    # 3. Request Groq API
    url = f"{GROQ_API_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": 0.2, # Low temperature for factual consistency
        "max_tokens": 1024
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(url, headers=headers, json=payload)
            if response.status_code != 200:
                logger.error(f"Groq API chat completion error: {response.status_code} - {response.text}")
                raise Exception(f"Groq API returned status {response.status_code}: {response.text}")
            
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"Failed to generate answer from Groq LLM: {str(e)}")
            raise e
