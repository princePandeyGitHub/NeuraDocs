import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import psycopg2
from app.config import DATABASE_URL
from app.services.embedder import get_single_embedding
from app.services.llm import generate_response

router = APIRouter(prefix="/rag", tags=["RAG"])
logger = logging.getLogger(__name__)

# Pydantic models for request body validation
class ChatHistoryMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str

class QueryRequest(BaseModel):
    query: str
    org_id: str
    history: List[ChatHistoryMessage] = []

def perform_vector_search(org_id: str, query_vector: list, limit: int = 5) -> list:
    """Queries PostgreSQL pgvector for chunks closest to the query embedding vector."""
    conn = psycopg2.connect(DATABASE_URL)
    chunks = []
    try:
        with conn:
            with conn.cursor() as cur:
                # Set transaction-local organization ID for Row-Level Security
                cur.execute("SELECT set_config('app.current_organization_id', %s, true)", (org_id,))
                
                vector_str = "[" + ",".join(map(str, query_vector)) + "]"
                cur.execute(
                    """
                    SELECT c.content, c.page_number, d.filename, (c.embedding <=> %s::vector) AS distance
                    FROM document_chunks c
                    JOIN documents d ON c.document_id = d.id
                    ORDER BY distance ASC
                    LIMIT %s
                    """,
                    (vector_str, limit)
                )
                
                rows = cur.fetchall()
                for row in rows:
                    chunks.append({
                        "content": row[0],
                        "page_number": row[1],
                        "filename": row[2],
                        "score": 1.0 - float(row[3]) if row[3] is not None else 0.0  # Cosine similarity score
                    })
    except Exception as e:
        logger.error(f"Vector search failed in DB: {e}")
        raise e
    finally:
        conn.close()
    return chunks

@router.post("/query")
async def rag_query(request: QueryRequest):
    """
    Executes a RAG query.
    1. Embeds the user query.
    2. Performs isolated vector similarity search in PostgreSQL.
    3. Triggers Groq Llama 3.1 LLM response generation with context and history.
    """
    try:
        logger.info(f"Received query request for org: {request.org_id}")
        
        # 1. Generate Query Vector
        try:
            query_vector = await get_single_embedding(request.query)
        except Exception as embed_err:
            logger.error(f"Failed to embed query: {embed_err}")
            raise HTTPException(status_code=500, detail="Failed to compute query embedding.")

        # 2. Retrieve Similar Context Chunks
        try:
            matched_chunks = perform_vector_search(request.org_id, query_vector, limit=5)
        except Exception as db_err:
            logger.error(f"Vector database search failed: {db_err}")
            raise HTTPException(status_code=500, detail="Database query failed during vector search.")

        # 3. Handle Empty Context
        if not matched_chunks:
            return {
                "response": "I couldn't find any uploaded documents in your organization library to answer this query. Please upload documents first.",
                "citations": []
            }

        # 4. Generate Synthesized Response via LLM
        formatted_history = [{"role": msg.role, "content": msg.content} for msg in request.history]
        
        try:
            ai_response = await generate_response(
                query=request.query,
                chunks=matched_chunks,
                history=formatted_history
            )
        except Exception as llm_err:
            logger.error(f"LLM synthesis failed: {llm_err}")
            raise HTTPException(status_code=500, detail="Failed to synthesize answer via LLM.")

        # 5. Extract Unique Citations for Frontend Reference
        citations = []
        seen_citations = set()
        for chunk in matched_chunks:
            citation_key = (chunk["filename"], chunk["page_number"])
            if citation_key not in seen_citations:
                seen_citations.add(citation_key)
                citations.append({
                    "filename": chunk["filename"],
                    "page_number": chunk["page_number"]
                })

        return {
            "response": ai_response,
            "citations": citations
        }

    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        logger.error(f"Unexpected error during RAG query: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred in RAG pipeline.")
