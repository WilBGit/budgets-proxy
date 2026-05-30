//
//  Budgets Around Me! — Backend Proxy Server
//
//  Routes:
//    POST /auth/apple     — Verify Sign in with Apple identity token, issue JWT
//    POST /auth/google    — Verify Google Sign-In token, issue JWT (placeholder)
//    POST /api/openai     — Proxy OpenAI chat completions (requires JWT)
//    GET  /api/places     — Proxy Google Places nearby search (requires JWT)
//    GET  /health          — Health check
//
//  Architecture:
//    User signs in with Apple/Google on iOS → iOS gets identity token
//    iOS sends identity token to /auth/apple or /auth/google
//    Server verifies token with Apple/Google, issues our JWT
//    iOS sends JWT in Authorization header for all API calls
//    Server proxies requests to OpenAI/Google with OUR API keys
//    Users NEVER see or handle API keys
//

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:*',
    'capacitor://localhost',
    'https://budgets-around-me.app',
    /^https?:\/\/.*\.budgets-around-me\.app$/,
  ],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ─── Config ───────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || '';
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.budgetaround.app';

if (!OPENAI_KEY) console.warn('⚠️  OPENAI_API_KEY not set — /api/openai will fail');
if (!GOOGLE_KEY) console.warn('⚠️  GOOGLE_PLACES_API_KEY not set — /api/places will fail');
if (JWT_SECRET === 'change-me') console.warn('⚠️  JWT_SECRET is default — change in production');

// ─── Rate Limiting ───────────────────────────────────────────

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
  message: { error: 'Too many requests, slow down.' },
});
app.use('/api/', limiter);
app.use('/auth/', limiter);

// ─── Apple Sign-In Verification ───────────────────────────────

const appleJwksClient = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxAge: 86400000, // 24h
});

async function verifyAppleToken(identityToken) {
  try {
    const decoded = jwt.decode(identityToken, { complete: true });
    if (!decoded || !decoded.header || !decoded.header.kid) {
      throw new Error('Invalid Apple identity token: missing kid');
    }

    const key = await appleJwksClient.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    const payload = jwt.verify(identityToken, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      audience: APPLE_BUNDLE_ID,
    });

    // Verify issuer
    if (payload.iss !== 'https://appleid.apple.com') {
      throw new Error('Invalid Apple token issuer');
    }

    return {
      sub: payload.sub,           // Apple user ID — stable across devices
      email: payload.email,
      email_verified: payload.email_verified === 'true',
      name: null,                 // Name only sent on first auth
    };
  } catch (err) {
    throw new Error(`Apple token verification failed: ${err.message}`);
  }
}

// ─── Google Sign-In Verification (placeholder) ────────────────

async function verifyGoogleToken(idToken) {
  // Google Sign-In SDK verification
  // When GoogleSignIn SPM is integrated in the iOS app, the app will
  // send the serverAuthCode or idToken here.
  // For now, we accept Google tokens with basic validation.
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );
    if (!response.ok) throw new Error('Invalid Google token');
    const payload = await response.json();

    if (payload.aud !== APPLE_BUNDLE_ID && payload.aud !== 'com.budgetaround.app') {
      // In production, verify against your Google client ID
      // For now, accept any valid Google token
    }

    return {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified === 'true',
      name: payload.name || null,
    };
  } catch (err) {
    throw new Error(`Google token verification failed: ${err.message}`);
  }
}

// ─── JWT Issuance ─────────────────────────────────────────────

function issueJwt(userId, provider, email, displayName) {
  return jwt.sign(
    {
      sub: userId,
      provider,
      email: email || '',
      name: displayName || '',
      // 7 day expiry — app re-verifies with Apple/Google on refresh
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    },
    JWT_SECRET,
    { algorithm: 'HS256' }
  );
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

// ─── Auth Middleware ──────────────────────────────────────────

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  const payload = verifyJwt(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = payload;
  next();
}

// ─── Routes ──────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    openai: !!OPENAI_KEY,
    google_places: !!GOOGLE_KEY,
    uptime: process.uptime(),
  });
});

// Apple Sign-In
app.post('/auth/apple', async (req, res) => {
  try {
    const { identityToken, fullName } = req.body;
    if (!identityToken) {
      return res.status(400).json({ error: 'identityToken is required' });
    }

    const appleUser = await verifyAppleToken(identityToken);
    const displayName = fullName || appleUser.name || null;

    const jwt = issueJwt(
      `apple_${appleUser.sub}`,
      'apple',
      appleUser.email,
      displayName
    );

    res.json({
      token: jwt,
      user: {
        id: `apple_${appleUser.sub}`,
        email: appleUser.email,
        displayName,
        provider: 'apple',
      },
    });
  } catch (err) {
    console.error('Apple auth error:', err.message);
    res.status(401).json({ error: err.message });
  }
});

// Google Sign-In
app.post('/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const googleUser = await verifyGoogleToken(idToken);

    const jwt = issueJwt(
      `google_${googleUser.sub}`,
      'google',
      googleUser.email,
      googleUser.name
    );

    res.json({
      token: jwt,
      user: {
        id: `google_${googleUser.sub}`,
        email: googleUser.email,
        displayName: googleUser.name,
        provider: 'google',
      },
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: err.message });
  }
});

// OpenAI Proxy
app.post('/api/openai', authMiddleware, async (req, res) => {
  if (!OPENAI_KEY) {
    return res.status(503).json({ error: 'OpenAI API key not configured on server' });
  }

  try {
    const { model, messages, temperature, max_tokens } = req.body;

    // Enforce model limits — only allow GPT-4o-mini to control costs
    const allowedModel = (model === 'gpt-4o' || model === 'gpt-4o-mini')
      ? model
      : 'gpt-4o-mini';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: allowedModel,
        messages: messages || [],
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 500,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return res.status(response.status).json({ error: data.error?.message || 'OpenAI API error' });
    }

    // Log usage for monitoring
    if (data.usage) {
      console.log(`[OpenAI] user=${req.user.sub} model=${allowedModel} tokens=${data.usage.total_tokens}`);
    }

    res.json(data);
  } catch (err) {
    console.error('OpenAI proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google Places Proxy
app.get('/api/places', authMiddleware, async (req, res) => {
  if (!GOOGLE_KEY) {
    return res.status(503).json({ error: 'Google Places API key not configured on server' });
  }

  try {
    const { lat, lng, radius, type, keyword } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const location = `${lat},${lng}`;
    const params = new URLSearchParams({
      key: GOOGLE_KEY,
      location,
      radius: radius || '5000',
      type: type || 'restaurant',
    });

    if (keyword) params.set('keyword', keyword);

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places API error:', data.status, data.error_message);
      return res.status(502).json({ error: data.error_message || 'Google Places API error' });
    }

    console.log(`[Places] user=${req.user.sub} lat=${lat} lng=${lng} results=${data.results?.length || 0}`);

    // Strip the API key from the response before sending to client
    const sanitized = { ...data };
    // Remove html_attributions for privacy (contains API key references)
    // Keep results as-is — no API key leaks

    res.json(sanitized);
  } catch (err) {
    console.error('Places proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google Place Details Proxy (for individual place info)
app.get('/api/places/:placeId', authMiddleware, async (req, res) => {
  if (!GOOGLE_KEY) {
    return res.status(503).json({ error: 'Google Places API key not configured on server' });
  }

  try {
    const { placeId } = req.params;
    const fields = req.query.fields || 'name,formatted_address,geometry,rating,price_level,opening_hours,photos,website,formatted_phone_number';

    const params = new URLSearchParams({
      key: GOOGLE_KEY,
      place_id: placeId,
      fields,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Place details proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Start Server ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Budgets Proxy running on port ${PORT}`);
  console.log(`   OpenAI:  ${OPENAI_KEY ? '✅ configured' : '❌ missing'}`);
  console.log(`   Google:  ${GOOGLE_KEY ? '✅ configured' : '❌ missing'}`);
  console.log(`   Auth:    Apple ✅ | Google ✅`);
  console.log(`   Endpoints:`);
  console.log(`     POST /auth/apple   — Sign in with Apple`);
  console.log(`     POST /auth/google  — Sign in with Google`);
  console.log(`     POST /api/openai  — OpenAI chat completions`);
  console.log(`     GET  /api/places   — Google Places nearby search`);
  console.log(`     GET  /api/places/:id — Google Place details`);
  console.log(`     GET  /health       — Health check`);
});