/**
 * Company Routes
 *
 * GET /api/companies - 企業一覧取得
 */

import { Router } from 'express';
import type { CompanyController } from '../controllers/company-controller.js';

export interface CompanyRoutesOptions {
  companyController: CompanyController;
}

export function createCompanyRoutes(options: CompanyRoutesOptions): Router {
  const router = Router();

  // GET /api/companies
  router.get('/', options.companyController.list);

  return router;
}
