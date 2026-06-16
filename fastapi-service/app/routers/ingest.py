import logging
from fastapi import APIRouter, UploadFile, Form, File, HTTPException, BackgroundTasks
import psycopg2
from app.config import DATABASE_URL
from app.services.parser import parse_document
from app.services.chunker import chunk_document_pages
from app.services.embedder import get_embeddings

router = APIRouter(prefix="/ingest", tags=["Ingestion"])
logger = logging.getLogger(__name__)

def mark_document_failed(org_id: str, doc_id: str):
    """Marks the document as FAILED in the shared database using RLS context."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT set_config('app.current_organization_id', %s, true)", (org_id,))
                cur.execute("UPDATE documents SET status = 'FAILED' WHERE id = %s", (doc_id,))
        conn.close()
        logger.info(f"Marked document {doc_id} as FAILED in DB.")
    except Exception as e:
        logger.error(f"Failed to mark document {doc_id} as FAILED in database: {e}")

def process_ingestion_sync(file_bytes: bytes, filename: str, doc_id: str, org_id: str):
    """Synchronous pipeline runner executing text extraction, chunking, embedding and DB upsert."""
    try:
        # 1. Parse File Content
        logger.info(f"Parsing document {filename} (ID: {doc_id})")
        pages = parse_document(file_bytes, filename)
        if not pages:
            raise ValueError("Document was empty or no text could be extracted.")

        # 2. Chunk Pages
        logger.info(f"Chunking document {doc_id}")
        chunks = chunk_document_pages(pages, chunk_size=1000, chunk_overlap=200)
        if not chunks:
            raise ValueError("No text chunks generated.")

        # 3. Generate Vector Embeddings
        logger.info(f"Generating embeddings for {len(chunks)} chunks of document {doc_id}")
        chunk_texts = [c["content"] for c in chunks]
        embeddings = []
        
        # Call Groq API in batches inside get_embeddings
        import asyncio
        # Run async get_embeddings in a synchronous thread context
        embeddings = asyncio.run(get_embeddings(chunk_texts))

        # 4. Insert into database
        logger.info(f"Inserting vector chunks and updating status for document {doc_id}")
        conn = psycopg2.connect(DATABASE_URL)
        try:
            with conn:
                with conn.cursor() as cur:
                    # Set RLS session context
                    cur.execute("SELECT set_config('app.current_organization_id', %s, true)", (org_id,))
                    
                    for chunk, embedding in zip(chunks, embeddings):
                        # Convert float list to vector string format e.g. '[0.1,0.2,0.3]'
                        vector_str = "[" + ",".join(map(str, embedding)) + "]"
                        
                        cur.execute(
                            """
                            INSERT INTO document_chunks (organization_id, document_id, content, embedding, page_number)
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (org_id, doc_id, chunk["content"], vector_str, chunk["page_number"])
                        )
                        
                    # Update status of document to COMPLETED
                    cur.execute(
                        "UPDATE documents SET status = 'COMPLETED' WHERE id = %s",
                        (doc_id,)
                    )
            logger.info(f"Successfully finished ingestion for document {doc_id}")
        except Exception as db_err:
            conn.rollback()
            raise db_err
        finally:
            conn.close()

    except Exception as e:
        logger.error(f"Ingestion failed for document {doc_id}: {str(e)}")
        mark_document_failed(org_id, doc_id)

@router.post("/upload")
async def upload_and_ingest(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    document_id: str = Form(...),
    org_id: str = Form(...)
):
    """
    Ingest a document.
    Reads file content, schedules background processing, and returns immediately.
    """
    try:
        file_bytes = await file.read()
        filename = file.filename
        
        # Schedule extraction and vectorization in background
        background_tasks.add_task(
            process_ingestion_sync,
            file_bytes,
            filename,
            document_id,
            org_id
        )
        
        return {
            "message": "File processing has been scheduled in the background.",
            "document_id": document_id
        }
    except Exception as e:
        logger.error(f"Failed to schedule ingestion: {e}")
        # Mark document failed since we couldn't even read it or schedule it
        mark_document_failed(org_id, document_id)
        raise HTTPException(status_code=500, detail=f"Failed to start ingestion process: {str(e)}")
