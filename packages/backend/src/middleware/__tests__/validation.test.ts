import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { validate, smsSendSchema, templateCreateSchema, templateUpdateSchema } from '../validation.js';

// --- Mock helpers ---

function createMockReqResNext(body: unknown = {}) {
  const req = { body } as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

// --- validate middleware factory ---

describe('validate middleware', () => {
  it('should call next and set parsed body on valid input', () => {
    const { req, res, next } = createMockReqResNext({ to: '09012345678', body: 'Hello' });
    validate(smsSendSchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.body).toEqual({ to: '09012345678', body: 'Hello' });
  });

  it('should return 400 with structured error on invalid input', () => {
    const { req, res, next } = createMockReqResNext({});
    validate(smsSendSchema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'リクエストのバリデーションに失敗しました。',
          details: expect.any(Object),
        }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should include field-level error details', () => {
    const { req, res, next } = createMockReqResNext({ to: 'invalid', body: '' });
    validate(smsSendSchema)(req, res, next);

    const response = (res.json as any).mock.calls[0][0];
    expect(response.error.details).toHaveProperty('to');
    expect(response.error.details).toHaveProperty('body');
    expect(next).not.toHaveBeenCalled();
  });
});

// --- smsSendSchema ---

describe('smsSendSchema', () => {
  it('should accept valid SMS send request', () => {
    const result = smsSendSchema.safeParse({
      to: '09012345678',
      body: 'テストメッセージ',
    });
    expect(result.success).toBe(true);
  });

  it('should accept request with all optional fields', () => {
    const result = smsSendSchema.safeParse({
      to: '08012345678',
      body: 'Hello',
      templateId: 'tmpl-1',
      ticketId: 'ticket-1',
      sendType: 'customer',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.templateId).toBe('tmpl-1');
      expect(result.data.ticketId).toBe('ticket-1');
      expect(result.data.sendType).toBe('customer');
    }
  });

  it('should accept 070 prefix numbers', () => {
    const result = smsSendSchema.safeParse({ to: '07012345678', body: 'msg' });
    expect(result.success).toBe(true);
  });

  it('should accept 080 prefix numbers', () => {
    const result = smsSendSchema.safeParse({ to: '08012345678', body: 'msg' });
    expect(result.success).toBe(true);
  });

  it('should accept 090 prefix numbers', () => {
    const result = smsSendSchema.safeParse({ to: '09012345678', body: 'msg' });
    expect(result.success).toBe(true);
  });

  it('should reject non-mobile phone numbers', () => {
    const result = smsSendSchema.safeParse({ to: '03012345678', body: 'msg' });
    expect(result.success).toBe(false);
  });

  it('should reject phone numbers with wrong length', () => {
    const result = smsSendSchema.safeParse({ to: '0901234567', body: 'msg' });
    expect(result.success).toBe(false);
  });

  it('should reject phone numbers with non-digit characters', () => {
    const result = smsSendSchema.safeParse({ to: '090-1234-5678', body: 'msg' });
    expect(result.success).toBe(false);
  });

  it('should reject missing phone number', () => {
    const result = smsSendSchema.safeParse({ body: 'msg' });
    expect(result.success).toBe(false);
  });

  it('should reject empty message body', () => {
    const result = smsSendSchema.safeParse({ to: '09012345678', body: '' });
    expect(result.success).toBe(false);
  });

  it('should reject whitespace-only message body', () => {
    const result = smsSendSchema.safeParse({ to: '09012345678', body: '   ' });
    expect(result.success).toBe(false);
  });

  it('should trim message body', () => {
    const result = smsSendSchema.safeParse({ to: '09012345678', body: '  hello  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe('hello');
    }
  });

  it('should reject invalid sendType', () => {
    const result = smsSendSchema.safeParse({
      to: '09012345678',
      body: 'msg',
      sendType: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid sendType values', () => {
    for (const sendType of ['customer', 'self_copy', 'test']) {
      const result = smsSendSchema.safeParse({ to: '09012345678', body: 'msg', sendType });
      expect(result.success).toBe(true);
    }
  });
});

// --- templateCreateSchema ---

describe('templateCreateSchema', () => {
  it('should accept valid template create request', () => {
    const result = templateCreateSchema.safeParse({
      name: 'テスト',
      body: 'こんにちは {{customer_name}} 様',
    });
    expect(result.success).toBe(true);
  });

  it('should accept request with all optional fields', () => {
    const result = templateCreateSchema.safeParse({
      name: 'テスト',
      body: 'Hello',
      companyId: 'company-1',
      brand: 'BrandA',
      purpose: '案内',
      department: '営業',
      visibility: 'global',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty name', () => {
    const result = templateCreateSchema.safeParse({ name: '', body: 'Hello' });
    expect(result.success).toBe(false);
  });

  it('should reject whitespace-only name', () => {
    const result = templateCreateSchema.safeParse({ name: '   ', body: 'Hello' });
    expect(result.success).toBe(false);
  });

  it('should reject empty body', () => {
    const result = templateCreateSchema.safeParse({ name: 'Test', body: '' });
    expect(result.success).toBe(false);
  });

  it('should reject missing name', () => {
    const result = templateCreateSchema.safeParse({ body: 'Hello' });
    expect(result.success).toBe(false);
  });

  it('should reject missing body', () => {
    const result = templateCreateSchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid variable format in body', () => {
    const result = templateCreateSchema.safeParse({
      name: 'Test',
      body: 'Hello {{}} world',
    });
    expect(result.success).toBe(false);
  });

  it('should reject variable with spaces', () => {
    const result = templateCreateSchema.safeParse({
      name: 'Test',
      body: 'Hello {{ name }} world',
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid variable format', () => {
    const result = templateCreateSchema.safeParse({
      name: 'Test',
      body: '{{customer_name}} 様、{{ticket_id}} の件',
    });
    expect(result.success).toBe(true);
  });

  it('should accept body without variables', () => {
    const result = templateCreateSchema.safeParse({
      name: 'Test',
      body: 'Plain text message',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid visibility value', () => {
    const result = templateCreateSchema.safeParse({
      name: 'Test',
      body: 'Hello',
      visibility: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid visibility values', () => {
    for (const visibility of ['company', 'personal', 'global']) {
      const result = templateCreateSchema.safeParse({
        name: 'Test',
        body: 'Hello',
        visibility,
      });
      expect(result.success).toBe(true);
    }
  });
});

// --- templateUpdateSchema ---

describe('templateUpdateSchema', () => {
  it('should accept empty object (no fields to update)', () => {
    const result = templateUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept partial update with name only', () => {
    const result = templateUpdateSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with body only', () => {
    const result = templateUpdateSchema.safeParse({ body: 'New body' });
    expect(result.success).toBe(true);
  });

  it('should reject empty name string', () => {
    const result = templateUpdateSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('should reject empty body string', () => {
    const result = templateUpdateSchema.safeParse({ body: '' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid variable format in body', () => {
    const result = templateUpdateSchema.safeParse({ body: 'Hello {{}} world' });
    expect(result.success).toBe(false);
  });

  it('should accept valid variable format in body', () => {
    const result = templateUpdateSchema.safeParse({ body: 'Hello {{name}} world' });
    expect(result.success).toBe(true);
  });

  it('should accept all optional classification fields', () => {
    const result = templateUpdateSchema.safeParse({
      companyId: 'company-1',
      brand: 'BrandA',
      purpose: '案内',
      department: '営業',
      visibility: 'personal',
    });
    expect(result.success).toBe(true);
  });
});
