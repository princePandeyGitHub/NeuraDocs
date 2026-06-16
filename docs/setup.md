# NeuraDocs: Multi-Tenant RAG Platform

NeuraDocs is a tenant-isolated Retrieval-Augmented Generation (RAG) platform allowing organizations to securely upload proprietary files (PDF, DOCX, JSON) and query them through an AI assistant. Data isolation is strictly guaranteed using PostgreSQL **Row-Level Security (RLS)** at the database layer.

---

## System Architecture Overview

NeuraDocs uses a decoupled microservices design:

1. **`express-gateway` (Port 5000)**: API entry point. Manages user authentication (JWT), organization registration, chat session metadata, role authorization, and redirects RAG/ingestion operations to the python service.
2. **`fastapi-service` (Port 8000)**: Core RAG engine. Manages document ingestion (parsing, chunking), calls the Groq Embeddings API (`nomic-embed-text-v1.5`), stores vector chunks in PostgreSQL (`pgvector`), and orchestrates chat completion via Llama 3.1 8B Instant.
3. **`frontend` (Port 5173)**: React + TypeScript single-page application styled using modern dark-mode glassmorphic components.

---

## Setup Instructions

### Prerequisite: PostgreSQL & `pgvector`
Ensure you have a PostgreSQL database running (locally or hosted, e.g. via Supabase or Neon). The database must support the `pgvector` extension.

1. Connect to your database shell or query tool.
2. Execute the initialization schema located in the Express Gateway:
   ```bash
   # Use psql or copy-paste the contents of:
   express-gateway/schema.sql
   ```
   *This creates the `organizations`, `users`, `documents`, `document_chunks`, `chat_sessions`, and `chat_messages` tables, enables RLS, and sets up tenant containment policies.*

---

### Step 1: Configure Environment Variables

#### Express Gateway Config
1. Rename or copy `express-gateway/.env.example` to `express-gateway/.env`.
2. Configure `DATABASE_URL` with your PostgreSQL connection string.
3. Keep or change default secrets.

#### FastAPI Service Config
1. Rename or copy `fastapi-service/.env.example` to `fastapi-service/.env`.
2. Configure `DATABASE_URL` matching your Express Gateway connection string.
3. **CRITICAL**: Enter your Groq API key in the `GROQ_API_KEY` parameter.

---

### Step 2: Install Dependencies & Run

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

## Verifying Tenant Isolation (RLS)

To test that Row-Level Security is actively guarding organization documents:
1. Register **Organization A** (`admin-a@acme.com`).
2. Log in and upload a document.
3. Register **Organization B** (`admin-b@corp.com`).
4. Log in and query the chatbot.
5. Organization B's queries **will not** retrieve or see any chunks from Organization A's document, even though they share the same database tables. RLS blocks access at the database level!
