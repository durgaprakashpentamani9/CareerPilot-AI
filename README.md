# CareerPilot AI

CareerPilot AI is a React/Vite internship CRM with an Express API. It includes account registration and login, resume-based opportunity recommendations, fit scores, skill gap guidance, tailored resume versions with PDF export, an application tracker, notifications, analytics, and a workflow dashboard.

## Run locally

Use Node.js 18 or newer. Open two PowerShell terminals in the project directory.

```powershell
cd server
npm install
npm run dev
```

In the second terminal:

```powershell
cd client
npm install
npm run dev
```

Open http://localhost:5173. In memory mode the seeded demo login is `demo@careerpilot.ai` / `Password@123`. The server listens at http://localhost:5000/api. Copy `server/.env.example` to `server/.env` to configure the port, client URL, JWT secret, and optional Atlas `MONGODB_URI`. The API loads this file from the server directory even when started from another working directory. If the URI is missing or MongoDB cannot connect within the timeout, startup continues in memory mode. MongoDB mode persists backend records; the memory-mode demo store resets when the server restarts.

To create a production client bundle, run `cd client; npm run build`; preview it with `npm run preview`.

## Database configuration

Set `MONGODB_URI` in `server/.env` to the Atlas connection string for your deployment, and allow the machine's IP in the Atlas Network Access list. If the runtime's DNS resolver cannot resolve SRV records, use Atlas's standard `mongodb://` seed-list string; keep `tls=true` enabled. Keep the real `.env` private; only `.env.example` belongs in version control. Startup logs report whether MongoDB connected without logging the URI or raw driver errors. A failed connection leaves the seeded in-memory application available.

## Current implementation limits

MongoDB support persists the API's current collections, but the live discovery feed, scheduled jobs, and Ollama integration described in `spec.md` are not implemented yet. Resume parsing uses `pdf-parse`; generated PDFs use the in-house PDF writer.
