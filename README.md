# SureBO 🔍
### Singapore's AI-Powered Multilingual Information Credibility Checker

> **"SureBO?"** — English for *"Are you sure?"* — helping Singaporeans verify claims before sharing.

---

<!-- Add a screenshot of the UI showing a verdict result here -->
<!-- ![SureBO UI Screenshot](./docs/screenshot.png) -->

---

## What It Does

SureBO lets users paste or speak any claim in **English, Malay, Mandarin, or Tamil** — no language barrier to fact-checking. It cross-references the claim against Singapore government sources, trusted news outlets, and real-time web data. Within seconds, it returns a clear verdict — **REAL / FAKE / MISLEADING / UNVERIFIED** — with a plain-language explanation and links to official sources.

---

## Features

- 🌐 **Multilingual detection** — English, Malay (MS), Mandarin (ZH), Tamil (TA)
- 🎙️ **Voice message transcription** — WhatsApp audio support via OpenAI Whisper
- 🔎 **RAG pipeline** — grounded in 20+ trusted Singapore sources
- 📊 **Trending claims dashboard** — see what's being fact-checked in real time
- 🇸🇬 **English-aware processing** — understands local phrasing and context

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js, Tailwind CSS |
| **AI Model** | Qwen 2.5 VL 72B (Alibaba Cloud DashScope) |
| **Orchestration** | LangChain |
| **Audio Transcription** | OpenAI Whisper |
| **Translation** | Helsinki-NLP (HuggingFace) |
| **Database** | Supabase (PostgreSQL) |
| **Vector / Search** | ClickHouse |
| **Web Search** | Tavily |
| **Observability** | Langfuse |

---

## Architecture

```
User Input (text / voice)
  → Whisper (audio → text)
  → Helsinki-NLP (Malay / Tamil / Mandarin → English)
  → RAG Context Builder (ClickHouse + Tavily + past fact-checks)
  → Qwen 2.5 VL 72B via Alibaba Cloud DashScope
  → Verdict JSON { REAL | FAKE | MISLEADING | UNVERIFIED }
  → Response localised back to user's language
  → Saved to Supabase
```

---

## Trusted Sources

SureBO uses a tiered source system to weight credibility:

| Tier | Sources |
|---|---|
| **Tier 1 — Official Government** | gov.sg, MOH, MAS, SPF, CPF, HDB, IRAS, ScamAlert |
| **Tier 2 — Established Media** | CNA, Straits Times, TODAY, Zaobao, Berita Harian, Tamil Murasu |
| **Tier 3 — Digital Media** | Mothership, MustShareNews, The Independent SG |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A ClickHouse instance
- Supabase project
- API keys (see below)

### Installation

```bash
git clone <repo>
cd surebo-check
npm install
```

### Environment Variables

Create a `.env.local` file in the root directory:

```env
OPENAI_API_KEY=
DASHSCOPE_API_KEY=
HUGGINGFACE_API_TOKEN=
CLICKHOUSE_HOST=
CLICKHOUSE_USER=
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=
LANGFUSE_SECRET_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_BASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TAVILY_API_KEY=
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Hackathon Context

```
Built for HackoMania 2026 — Ahrefs Challenge

"AI-powered solutions that help local and multilingual communities in Singapore
assess information credibility, understand context, and make informed decisions."
```

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

## License

[MIT](./LICENSE)
