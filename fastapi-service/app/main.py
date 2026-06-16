import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import ingest, rag

# Setup basic logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger("neuradocs-fastapi")

app = FastAPI(
    title="NeuraDocs RAG Microservice",
    description="Python FastAPI backend handling ingestion, vector storage, and RAG execution.",
    version="1.0.0"
)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this to Express Gateway URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(ingest.router)
app.include_router(rag.router)

@app.get("/health")
async def health_check():
    """Simple API health check endpoint."""
    return {"status": "UP", "service": "fastapi-service"}
