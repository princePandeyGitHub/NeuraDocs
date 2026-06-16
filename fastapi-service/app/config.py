import os
from dotenv import load_dotenv

# Load environmental variables from .env file
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/neuradocs")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text-v1.5")
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")

# Groq API endpoint URL (compatible with OpenAI format)
GROQ_API_URL = "https://api.groq.com/openai/v1"
