import httpx
import logging
from app.config import GROQ_API_KEY, GROQ_API_URL, EMBEDDING_MODEL

logger = logging.getLogger(__name__)

async def get_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Generates vector embeddings for a list of text strings using Groq's embedding model.
    Processes inputs in batches of 16 to manage rate limits and payload sizes.
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY environment variable is not configured.")

    url = f"{GROQ_API_URL}/embeddings"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    batch_size = 16
    all_embeddings = []
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            payload = {
                "model": EMBEDDING_MODEL,
                "input": batch
            }
            try:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    logger.error(f"Groq API embeddings error: {response.status_code} - {response.text}")
                    raise Exception(f"Groq API returned status {response.status_code}: {response.text}")
                
                data = response.json()
                results = data.get("data", [])
                # Sort by index to maintain text alignment
                results.sort(key=lambda x: x["index"])
                batch_embeddings = [item["embedding"] for item in results]
                all_embeddings.extend(batch_embeddings)
            except Exception as e:
                logger.error(f"Failed to generate embeddings from Groq: {str(e)}")
                raise e
                
    return all_embeddings

async def get_single_embedding(text: str) -> list[float]:
    """
    Generates vector embedding for a single text query.
    """
    results = await get_embeddings([text])
    return results[0]
