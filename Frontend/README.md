# Policy Flow Frontend

A responsive Next.js and Tailwind CSS dashboard for the Policy Flow FastAPI service.

## Run locally

Use Node.js 20.19 or newer.

```bash
cd Frontend
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Set `NEXT_PUBLIC_API_URL` to the base URL for the FastAPI server (defaults to `http://localhost:8000`). The sidebar URL editor can override that value for the current browser.

## Screens

The shared dashboard shell links to Dashboard, Policies, Decision Playground, History, API Playground, Settings, and API Keys. Non-dashboard screens can also be opened directly with the `?page=` query parameter, for example `http://localhost:3000/?page=Policies`.

## Connected API routes

- `GET /health` — API connectivity and latency indicator, polled every 30 seconds.
- `POST /v1/gmail/decide` — decision playground requests.
- `POST /v1/policies/upload` — PDF policy upload and rule extraction.

The current FastAPI service does not provide policy-list, decision-history, settings, webhook, or API-key management endpoints. Accordingly, uploaded policy rules and successful decisions update the current browser session; the policy upload becomes active in the backend's in-memory rule store. No per-rule trace is included in the decision response. Those areas are identified as sample/session data rather than presented as backend-persisted records.

The dashboard includes local sample data when the API is unavailable. The API Keys page uses illustrative demo records; it does not provision or store real credentials. Login and sign-up are interactive UI demonstrations; they do not create real accounts. For a deployed frontend, set the FastAPI `FRONTEND_ORIGINS` environment variable to a comma-separated list of allowed browser origins.
