# Budgets Around Me! — Proxy Server

Backend proxy for the "Budgets Around Me!" iOS app. Routes OpenAI and Google Places API calls through authenticated endpoints so API keys are never exposed to the client.

## Architecture

```
iOS App → Sign in with Apple/Google → Backend Proxy (JWT) → OpenAI/Google APIs
                                      ↑
                                 YOUR API KEYS
```

Users authenticate with their Apple/Google account. The server issues a JWT. All subsequent API calls include the JWT. The server proxies requests to OpenAI and Google using **your** API keys.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/apple` | None | Verify Apple identity token, issue JWT |
| POST | `/auth/google` | None | Verify Google ID token, issue JWT |
| POST | `/api/openai` | JWT | Proxy OpenAI chat completions |
| GET | `/api/places` | JWT | Proxy Google Places nearby search |
| GET | `/api/places/:id` | JWT | Proxy Google Place details |
| GET | `/health` | None | Health check |

## Quick Start

```bash
# 1. Copy and configure
cp .env.example .env
# Edit .env with your API keys and JWT secret

# 2. Install dependencies
npm install

# 3. Run
npm start

# 4. Test
curl http://localhost:3000/health
```

## Deployment

### Fly.io (recommended)

```bash
fly launch --name budgets-proxy
fly secrets set OPENAI_API_KEY=sk-... GOOGLE_PLACES_API_KEY=AIzaSy... JWT_SECRET=$(openssl rand -hex 32)
fly deploy
```

### Railway

```bash
railway init
railway variables set OPENAI_API_KEY=sk-... GOOGLE_PLACES_API_KEY=AIzaSy... JWT_SECRET=$(openssl rand -hex 32)
railway up
```

### Docker

```bash
docker build -t budgets-proxy .
docker run -p 3000:3000 --env-file .env budgets-proxy
```

## iOS Configuration

Set the proxy URL in `ProxyService.swift`:

```swift
// Production
private let baseURL = URL(string: "https://budgets-proxy.fly.dev")!

// Development
#if DEBUG
private let baseURL = URL(string: "http://localhost:3000")!
#endif
```

## Security

- API keys are **server-side only** — never sent to the iOS client
- JWT tokens expire after 7 days
- Rate limiting: 60 requests/minute per IP
- Apple identity tokens verified against Apple's JWKS
- Google ID tokens verified against Google's tokeninfo endpoint
- CORS restricted to app domains
- Helmet.js security headers