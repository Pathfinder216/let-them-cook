import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { config } from '../config.js';
import * as shareService from '../services/share.service.js';
import { sharedLimiter } from '../middleware/rateLimits.js';

// Public, token-gated read-only access to a shared recipe. Mounted in app.ts BEFORE the CSRF +
// requireAuth gates — the unguessable token is the only credential. No user session is involved.
const router = Router();

// Per-IP limiter on the whole public surface (see rateLimits.ts).
router.use(sharedLimiter);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// GET /api/shared/:token — the latest-version recipe behind an active share (404 if unknown/revoked).
router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const recipe = await shareService.getSharedRecipe(req.params.token as string);
    res.json(recipe);
  }),
);

// GET /api/shared/:token/media/:mediaId — stream a media file, but only if it belongs to the
// shared recipe's version chain. Ownership is checked via the share, not the session, so the
// authed /media mount is not widened.
router.get(
  '/:token/media/:mediaId',
  asyncHandler(async (req, res) => {
    const mediaPath = await shareService.getSharedMediaPath(
      req.params.token as string,
      req.params.mediaId as string,
    );
    // Stored path is `/media/{filename}`; serve the file from MEDIA_STORAGE_PATH by basename.
    res.sendFile(path.basename(mediaPath), { root: config.MEDIA_STORAGE_PATH });
  }),
);

export default router;
