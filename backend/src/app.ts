import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/requireAuth.js';
import { doubleCsrfProtection } from './middleware/csrf.js';
import authRouter from './routes/auth.js';
import recipesRouter from './routes/recipes.js';
import coursesRouter from './routes/courses.js';
import labelsRouter from './routes/labels.js';
import mealPlansRouter from './routes/meal-plans.js';
import importRouter from './routes/import.js';
import substitutionsRouter from './routes/substitutions.js';
import mediaRouter from './routes/media.js';
import ingredientsRouter from './routes/ingredients.js';
import metaRouter from './routes/meta.js';
import sharedRouter from './routes/shared.js';
import fs from 'fs';

export function createApp() {
  const app = express();

  // In production the app sits behind the Pi's nginx reverse proxy (TLS terminates there; the
  // container speaks plain HTTP on localhost). Trust the first hop so req.secure / req.ip reflect
  // the X-Forwarded-* headers nginx sets — required for `secure` cookies to be issued, and for
  // accurate client IPs (rate limiting). Off in dev/test, where there is no proxy in front.
  if (config.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // Middleware
  // CSP is enabled in production only: the prod bundle is a compiled Vite build (no inline
  // scripts), but in dev the frontend is served by Vite on :5173 (not this process) and HMR
  // injects inline scripts that a strict policy would reject — so a CSP here would only ever
  // bite the prod bundle. Directives are kept narrow; scriptSrc never gets 'unsafe-inline'.
  app.use(
    helmet({
      contentSecurityPolicy:
        config.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // style attributes (React inline styles, FLIP animation)
                imgSrc: ["'self'", 'blob:', 'data:'], // blob: for crop previews (plan 26), data: for icons
                mediaSrc: ["'self'", 'blob:'],
                connectSrc: ["'self'"], // API + service worker fetches
                workerSrc: ["'self'"], // PWA service worker; tesseract worker (plan 32) is same-origin
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'self'"],
              },
            }
          : false,
    }),
  );
  // credentials:true is required for the browser to send/receive auth cookies. In dev the Vite
  // proxy keeps requests same-origin; CORS_ORIGIN is only needed for split-origin hosting.
  app.use(cors({ origin: config.CORS_ORIGIN ?? true, credentials: true }));
  app.use(cookieParser(config.SESSION_SECRET));
  app.use(express.json({ limit: '10mb' }));

  if (config.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  // Health check (public)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  fs.mkdirSync(config.MEDIA_STORAGE_PATH, { recursive: true });

  // Auth routes are public (register/login) and handle their own CSRF issuance, so they are
  // mounted before the CSRF + requireAuth gates.
  app.use('/api/auth', authRouter);

  // Public token-gated recipe sharing (read-only). Like /api/auth, mounted before the CSRF +
  // requireAuth gates: the unguessable share token is the only credential, and its media route
  // enforces its own ownership so it doesn't need — and must not sit behind — a session.
  app.use('/api/shared', sharedRouter);

  // All other /api routes require CSRF validation (state-changing methods) and a live session.
  // Scoped to /api so the public auth routes, media, and the production SPA shell are unaffected.
  app.use('/api', doubleCsrfProtection);
  app.use('/api', requireAuth);

  // Authenticated media — served only to logged-in users (true per-user isolation).
  app.use('/media', requireAuth, express.static(config.MEDIA_STORAGE_PATH));

  // Routes
  app.use('/api/recipes', recipesRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/labels', labelsRouter);
  // Label/category assignment routes are mounted under /api to allow /api/recipes/:id/labels
  app.use('/api', labelsRouter);
  app.use('/api/meal-plans', mealPlansRouter);
  app.use('/api/import', importRouter);
  app.use('/api/substitutions', substitutionsRouter);
  app.use('/api/ingredients', ingredientsRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api', mediaRouter);

  // Serve frontend in production
  if (config.NODE_ENV === 'production') {
    const frontendDist = path.resolve('../frontend/dist');
    app.use(express.static(frontendDist));
    // SPA fallback for client-side routes (not API/media)
    app.get(/^(?!\/api(\/|$)|\/media(\/|$))/, (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
