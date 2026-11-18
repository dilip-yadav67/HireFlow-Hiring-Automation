# HireFlow
AI-assisted hiring dashboard. React (Vite) + Node/Express + MongoDB Atlas. Resume scoring and the copilot use the free Gemini API; without a key it falls back to keyword scoring.

## Run locally
backend: `cd backend && cp .env.example .env` (fill it) `&& npm i && npm start`
frontend: `cd frontend && cp .env.example .env && npm i && npm run dev`

## Deploy (all free)
1. **MongoDB Atlas**: create an M0 cluster and a DB user, then Network Access -> allow 0.0.0.0/0. Copy the connection string.
2. **Render** (Web Service, root dir `backend`): build `npm install`, start `npm start`. Env vars: MONGODB_URI, JWT_SECRET, GEMINI_API_KEY (free from Google AI Studio), CLIENT_URL (your Vercel URL, set after step 3).
3. **Vercel** (root dir `frontend`, framework Vite): env var `VITE_API_URL` = your Render URL. Deploy.
4. Set CLIENT_URL on Render to the Vercel URL, redeploy. Optional: ping the Render URL every 10 min with UptimeRobot to reduce cold starts.

## Selection logic
Each application gets a 0-100 score. Score >= job cutoff and rank within the shortlist limit => `shortlisted`, otherwise `rejected`. Recruiters can override any status (PATCH /api/applications/:id).

## Added: AI interview, PDF upload, emails
- Shortlisted candidates get an email with `/#/interview/<token>`. The page reads questions aloud, accepts spoken (browser speech recognition, Chrome works best) or typed answers, and shows an optional camera preview that is never recorded.
- Final score = 40% resume + 60% interview. When no shortlisted candidate is left waiting, the top `openings` are hired, the rest rejected, and the job closes. Recruiters can override statuses on the Candidates page.
- Emails: set `RESEND_API_KEY` (free tier, sends from onboarding@resend.dev only to your own address until you verify a domain) or set `N8N_WEBHOOK_URL`; the backend then POSTs `{event, to, name, subject, text, job, link}` and an n8n workflow (Webhook -> Send Email) delivers it.
