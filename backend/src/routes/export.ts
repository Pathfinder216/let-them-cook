import { Router, Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { exportSchemaOrg, exportFull } from '../services/export.service.js';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// GET /api/export?format=schema-org|full — download all of the user's recipe data.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const format = typeof req.query.format === 'string' ? req.query.format : '';
    if (format !== 'schema-org' && format !== 'full') {
      throw new AppError(400, 'format must be "schema-org" or "full"');
    }

    const userId = req.userId!;
    const date = new Date().toISOString().slice(0, 10);
    const body = format === 'schema-org' ? await exportSchemaOrg(userId) : await exportFull(userId);

    res.setHeader('Content-Disposition', `attachment; filename="kitchen-canon-export-${date}.json"`);
    res.json(body);
  }),
);

export default router;
