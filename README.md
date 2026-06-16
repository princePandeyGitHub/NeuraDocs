# NeuraDocs: Multi-Tenant RAG Platform

NeuraDocs is a tenant-isolated Retrieval-Augmented Generation (RAG) platform allowing organizations to securely upload proprietary files (PDF, DOCX, JSON) and query them through an AI assistant. Data isolation is strictly guaranteed using PostgreSQL **Row-Level Security (RLS)** at the database layer.

---

## System Architecture Overview

NeuraDocs uses a decoupled microservices design:

1. **`express-gateway` (Port 5000)**: API entry point. Manages user authentication (JWT), organization registration, chat session metadata, role authorization, and redirects RAG/ingestion operations to the python service.
2. **`fastapi-service` (Port 8000)**: Core RAG engine. Manages document ingestion (parsing, chunking), calls the Groq Embeddings API (`nomic-embed-text-v1.5`), stores vector chunks in PostgreSQL (`pgvector`), and orchestrates chat completion via Llama LLM.
3. **`frontend` (Port 5173)**: React + TypeScript single-page application styled using modern dark-mode glassmorphic components.

---

### : Install Dependencies & Run

For convenience, you can run each service in a separate terminal.

#### 1. Start the Express Gateway
```bash
cd express-gateway
npm install
npm run dev
```
*App will start on http://localhost:5000*

#### 2. Start the FastAPI Service
Create a virtual environment, install requirements, and run:
```bash
cd fastapi-service
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python run.py
```
*App will start on http://localhost:8000*

#### 3. Start the React Frontend
```bash
cd frontend
npm run dev
```
*Vite web server will start on http://localhost:5173*

---