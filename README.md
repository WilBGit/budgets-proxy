# Budgets Around Me! — Proxy Server

Backend proxy for the "Budgets Around Me!" iOS app. Routes OpenAI and Google Places API calls through authenticated endpoints so API keys are never exposed to the client.

## One-Click Deploy to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/WilBGit/budgets-proxy)

## Manual Deploy

1. Fork this repo
2. Go to [Render Dashboard](https://dashboard.render.com) → New Web Service
3. Connect your GitHub repo: `WilBGit/budgets-proxy`
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.mjs`
   - **Environment:** Node
   - **Plan:** Free
5. Add environment variables:
   - `OPENAI_API_KEY` — Your OpenAI API key
   - `GOOGLE_PLACES_API_KEY` — Your Google Places API key
   - `JWT_SECRET` — Random 32-byte hex (`openssl rand -hex 32`)
6. Deploy!

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/apple` | None | Verify Apple identity token, issue JWT |
| POST | `/auth/google` | None | Verify Google ID token, issue JWT |
| POST | `/api/openai` | JWT | Proxy OpenAI chat completions |
| GET | `/api/places` | JWT | Proxy Google Places nearby search |
| GET | `/api/places/:id` | JWT | Proxy Google Place details |
| GET | `/health` | None | Health check |

## Security

- API keys stored server-side only — never sent to client
- JWT tokens expire after 7 days
- Rate limiting: 60 requests/minute per IP
- Apple identity tokens verified against Apple's JWKS
- Google ID tokens verified via Google's tokeninfo endpoint
- CORS restricted to app domains
- Helmet.js security headers
