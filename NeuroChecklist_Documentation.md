# NeuroChecklist: Project Documentation
**Version 1.0 | Project Handoff & User Guide**

---

## 1. Project Overview

**NeuroChecklist** is a high-performance, AI-native platform designed to bridge the gap between complex neurological research and clinical practice. Built for founders, clinicians, and medical students, the platform centralizes diagnostic protocols, medical criteria, and research tools into a single, intelligent interface.

The core value proposition is **"Clarity at the Point of Care,"** enabling users to navigate dense clinical data using natural language and structured diagnostic checklists.

---

## 2. Product Features (User Guide)

### 2.1 Axon AI Research Assistant
The centerpiece of the platform is **Axon AI**, a specialized conversational agent.
*   **Clinical Queries:** Users can ask natural language questions about specific neurological conditions or diagnostic criteria.
*   **Contextual Assistance:** Designed to guide users through the primary neurology workflow, refusing out-of-scope queries to maintain medical integrity.
*   **Citation-First Responses:** The AI is tuned to prioritize data from the internal knowledge base over general web data.

### 2.2 Medical Checklist Library
A digital repository of industry-standard diagnostic protocols.
*   **Structured Criteria:** Protocols like the *McDonald 2017 criteria* are broken down into interactive, easy-to-read formats.
*   **Recent Articles & Blog:** A centralized hub for the latest neurology news and platform updates, optimized for search and discovery.

### 2.3 Global Search & Discovery
A lightning-fast search engine built into the header, allowing users to jump directly to any checklist, article, or clinical protocol.

---

## 3. Technical Architecture (Engineering Handoff)

### 3.1 RAG API Architecture
The intelligence layer is powered by a custom RAG (Retrieval-Augmented Generation) API designed for high-speed medical data retrieval and synthesis.
*   **Vector Store:** Qdrant (Self-hosted or Qdrant Cloud).
*   **Embeddings:** `BAAI/bge-m3` loaded locally via HuggingFace / sentence-transformers for maximum privacy and performance.
*   **LLM Synthesis:** Groq API leveraging `llama-3.3-70b-versatile` for near-instant response generation.
*   **Indexing Logic:** Automated via `scripts/build_index.py` to embed clinical documents and upsert them into the Qdrant vector space.

### 3.2 Infrastructure & Automation
*   **n8n Workflows:** Handles complex logic for real-time shift matching and clinical alerts.
*   **Capacity:** Scaled for 500+ concurrent active sessions, with WhatsApp rate limits managed via dedicated workers.

### 3.3 Analytics & Growth
*   **PostHog:** Full-stack behavioral tracking, including session recordings, heatmaps, and conversion funnels to monitor user paths and optimize the UX.
*   **SEO Optimization:** Semantic HTML structure and optimized meta tags for high SERP performance across medical and educational categories.

---

## 4. Core Module Breakdown

### 4.1 Project Directory Structure
```text
├── api/                   # FastAPI server logic & route definitions
├── prisma/                # Database schema & migration files (PostgreSQL)
├── scripts/               # Maintenance scripts (e.g., build_index.py)
├── .env.example           # Template for required environment variables
├── pyproject.toml         # Python dependency management (uv)
├── railway.toml           # Railway deployment configuration
└── nixpacks.toml          # Custom build instructions for production
```

### 4.2 Module Responsibilities

*   **API Layer (`/api`)**: The interface for the front-end. It handles user authentication, clinical queries, and acts as the bridge between the AI engine and the user.
*   **Database Layer (`/prisma`)**: Manages relational data. While Qdrant handles "meaning" (vectors), Prisma handles "facts" (user data, checklist metadata, and structured content).
*   **Automation Scripts (`/scripts`)**: Contains the `build_index.py` logic which powers the RAG pipeline by synchronizing the knowledge base with the vector store.
*   **Production Config**: Includes `Procfile` and `railway.toml` to ensure the application scales automatically and maintains high availability.

---

## 5. Technical Implementation & Deployment

### 5.1 Setup & Local Development
The project requires `uv` for lightning-fast dependency management.
```bash
# Install dependencies
uv sync

# Configure environment
cp .env.example .env
```

**Running the Server Locally:**
```bash
uv run uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
```

### 5.2 Building the Knowledge Index
Run this command once (or whenever source data changes) to embed documents into Qdrant:
```bash
uv run python scripts/build_index.py
```

### 5.3 API Endpoints
| Method | Path | Description |
| :--- | :--- | :--- |
| **GET** | `/health` | Qdrant connectivity and system health check |
| **POST** | `/query` | RAG query — retrieves context and optionally generates answers |

**Example Request (`POST /query`):**
```json
{
  "question": "what is alzheimer's disease",
  "top_k": 5,
  "generate_answer": true
}
```

### 5.4 Deployment (Railway)
1.  **Start Command:** `uvicorn api.server:app --host 0.0.0.0 --port $PORT`
2.  **Resource Requirements:** Minimum **2 GB RAM** (required for PyTorch to load embedding model weights on first boot).

### 5.5 Environment Variables
| Variable | Default | Description |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | — | **Required.** Groq API key |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant instance URL |
| `QDRANT_API_KEY` | (empty) | Qdrant API key (blank for local) |
| `QDRANT_COLLECTION` | `checklist` | Collection name to query |
| `MODEL_EMBED` | `BAAI/bge-m3` | HuggingFace embedding model |
| `MODEL_LLM` | `llama-3.3-70b-versatile` | Groq model name |

---

## 6. Strategic Roadmap

The platform is built for rapid expansion and deeper personalization.

*   **Dynamic Personalization:** Implementing usage-based content surfaces (e.g., "Most Popular" sections) powered by live PostHog data.
*   **Multi-Audience Expansion:** Developing specialized entry points for distinct user groups:
    *   **Healthcare Professionals:** Deep-dive diagnostic tools.
    *   **Students & Patients:** Educational summaries and simplified checklists.
    *   **Organizations:** Institutional-level access and protocol management.
*   **Content Dominance:** Transitioning the "Podcast" infrastructure into a high-authority medical blog to capture broader search traffic and establish thought leadership.

---

**Delivered by Zeffron Studio**  
*Building the Custom AI Products Your Investors Want to Fund.*
