/**
 * Template CRUD Routes Tests
 * Requirements: 2.1, 2.4, 2.5, 2.6, 14.2
 *
 * Tests for PUT, DELETE, duplicate, and favorite endpoints
 * with audit logging verification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

import { TemplateController } from '../template-controller.js';
import { createTemplateRoutes } from '../../routes/template-routes.js';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  phone: '09012345678',
  role: 'SUPERVISOR' as const,
  companyId: 'company-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTemplate = {
  id: 'tpl-1',
  name: 'Original',
  body: 'Hello {{customer_name}}',
  companyId: 'company-1',
  brand: null,
  purpose: null,
  department: null,
  visibility: 'company' as const,
  createdBy: 'user-1',
  lastUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function fakeAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = mockUser;
  next();
}

function passthrough(_req: Request, _res: Response, next: NextFunction) {
  next();
}

async function request(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
) {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    return { status: res.status, body: json };
  } finally {
    server.close();
  }
}

describe('Template CRUD Routes', () => {
  const mockTemplateService = {
    search: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(mockTemplate),
    findById: vi.fn().mockResolvedValue(mockTemplate),
    update: vi.fn().mockResolvedValue({ ...mockTemplate, name: 'Updated' }),
    delete: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn().mockResolvedValue({ ...mockTemplate, id: 'tpl-2', name: 'Copy' }),
    toggleFavorite: vi.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    log: vi.fn().mockResolvedValue(undefined),
    search: vi.fn(),
  };

  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use(fakeAuth);

    const templateController = new TemplateController(
      mockTemplateService as any,
      mockAuditService as any,
    );

    app.use(
      '/api/templates',
      createTemplateRoutes({
        templateController,
        requireSupervisor: passthrough,
        validateUpdate: passthrough,
      }),
    );
  });

  describe('PUT /api/templates/:id', () => {
    it('should update a template and return it', async () => {
      const res = await request(app, 'PUT', '/api/templates/tpl-1', {
        name: 'Updated',
      });

      expect(res.status).toBe(200);
      expect(res.body.template.name).toBe('Updated');
      expect(mockTemplateService.findById).toHaveBeenCalledWith('tpl-1');
      expect(mockTemplateService.update).toHaveBeenCalledWith('tpl-1', { name: 'Updated' });
    });

    it('should record audit log with before/after values', async () => {
      await request(app, 'PUT', '/api/templates/tpl-1', { name: 'Updated' });

      expect(mockAuditService.log).toHaveBeenCalledOnce();
      const entry = mockAuditService.log.mock.calls[0][0];
      expect(entry.action).toBe('template_update');
      expect(entry.resourceType).toBe('template');
      expect(entry.resourceId).toBe('tpl-1');
      expect(entry.details.before).toEqual(mockTemplate);
      expect(entry.details.after).toBeDefined();
    });

    it('should return 404 when template not found', async () => {
      mockTemplateService.findById.mockResolvedValueOnce(null);

      const res = await request(app, 'PUT', '/api/templates/nonexistent', {
        name: 'Updated',
      });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/templates/:id', () => {
    it('should delete a template and return 204', async () => {
      const res = await request(app, 'DELETE', '/api/templates/tpl-1');

      expect(res.status).toBe(204);
      expect(mockTemplateService.delete).toHaveBeenCalledWith('tpl-1');
    });

    it('should record audit log on delete', async () => {
      await request(app, 'DELETE', '/api/templates/tpl-1');

      expect(mockAuditService.log).toHaveBeenCalledOnce();
      const entry = mockAuditService.log.mock.calls[0][0];
      expect(entry.action).toBe('template_delete');
      expect(entry.resourceId).toBe('tpl-1');
      expect(entry.details.before).toEqual(mockTemplate);
    });

    it('should return 404 when template not found', async () => {
      mockTemplateService.findById.mockResolvedValueOnce(null);

      const res = await request(app, 'DELETE', '/api/templates/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/templates/:id/duplicate', () => {
    it('should duplicate a template', async () => {
      const res = await request(app, 'POST', '/api/templates/tpl-1/duplicate', {
        name: 'Copy',
      });

      expect(res.status).toBe(201);
      expect(res.body.template.id).toBe('tpl-2');
      expect(res.body.template.name).toBe('Copy');
      expect(mockTemplateService.duplicate).toHaveBeenCalledWith('tpl-1', 'Copy', 'user-1');
    });

    it('should record audit log on duplicate', async () => {
      await request(app, 'POST', '/api/templates/tpl-1/duplicate', { name: 'Copy' });

      expect(mockAuditService.log).toHaveBeenCalledOnce();
      const entry = mockAuditService.log.mock.calls[0][0];
      expect(entry.action).toBe('template_create');
      expect(entry.details.sourceTemplateId).toBe('tpl-1');
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app, 'POST', '/api/templates/tpl-1/duplicate', {});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when source template not found', async () => {
      mockTemplateService.duplicate.mockRejectedValueOnce(
        new Error('Template not found: tpl-999'),
      );

      const res = await request(app, 'POST', '/api/templates/tpl-999/duplicate', {
        name: 'Copy',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/templates/:id/favorite', () => {
    it('should toggle favorite and return success', async () => {
      const res = await request(app, 'POST', '/api/templates/tpl-1/favorite');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockTemplateService.toggleFavorite).toHaveBeenCalledWith('tpl-1', 'user-1');
    });
  });
});
