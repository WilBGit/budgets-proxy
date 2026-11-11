# Budgets Around Me! Proxy

A small Node.js backend boundary for the Budgets Around Me! iOS app. It keeps provider credentials on the server and gives the mobile client a narrow, authenticated interface for AI assistance and nearby-place discovery.

The central design goal is simple: the iOS app can call the product API, but it never needs to ship an OpenAI or Google Places secret to every device.

## Responsibilities

- Verify Apple and Google identity tokens.
- Issue application JWTs after successful identity verification.
- Proxy approved OpenAI chat-completion requests.
- Proxy Google Places nearby-search and place-details requests.
- Apply rate limiting, security headers, CORS policy, and input validation.
- Provide a health endpoint for deployment checks.

## API surface

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/apple` | None | Verify an Apple identity token and issue a JWT. |
| `POST` | `/auth/google` | None | Verify a Google identity token and issue a JWT. |
| `POST` | `/api/openai` | JWT | Forward an approved AI request using the server-side key. |
| `GET` | `/api/places` | JWT | Search for nearby places. |
| `GET` | `/api/places/:id` | JWT | Retrieve place details. |
| `GET` | `/health` | None | Return service health. |

## Local setup

Requirements:

- Node.js and npm
- The environment variables documented in `.env.example`
- A reachable OpenAI account and Google Places account for live provider calls

Install and run:

```bash
npm install
node server.mjs
```

The exact listening port and deployment configuration are defined by the project runtime files. Use the health endpoint before connecting the iOS app.

## Deployment

The repository includes Render and container-oriented configuration. The Render deployment path can be started from the repository's one-click configuration, or deployed manually with:

- Build command: `npm install`
- Start command: `node server.mjs`
- Environment variables configured in the hosting provider, never committed to Git

## Security controls

- Provider keys stay server-side.
- JWTs are signed with a private server secret and expire.
- Rate limiting reduces abuse from a single client or IP.
- Apple tokens are checked against Apple's signing keys.
- Google identity tokens are verified before issuing an application token.
- CORS and security headers limit browser-facing exposure.
- The repository contains configuration names and examples, not live secrets.

Generate a strong JWT secret with a local command such as `openssl rand -hex 32`, then store it in the hosting provider's secret configuration. Never paste the generated value into this README, source code, or a public issue.

## Relationship to the iOS app

The companion client is here:

https://github.com/WilBGit/Budgets-Around-Me-

The two repositories are intentionally separated. The iOS client owns the user experience. This service owns provider access, authentication verification, and the server-side security boundary.

## Production checklist

Before a public release, verify provider quotas, authentication replay protections, request-size limits, error redaction, logging privacy, CORS origins, rate limits, dependency updates, TLS, monitoring, and a complete mobile-to-backend integration test. A successful deployment is not evidence that the provider credentials or identity flow are configured safely.
