import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ZendeskService } from '../zendesk-service.js';
import type { ZendeskConfig, InternalNoteData, FetchFn } from '../zendesk-service.js';

// --- Helpers ---

const defaultConfig: ZendeskConfig = {
  subdomain: 'testcompany',
  email: 'agent@example.com',
  apiToken: 'test-api-token-123',
};

function createMockFetch(responses: Array<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }>): FetchFn {
  const fn = vi.fn<FetchFn>();
  for (const res of responses) {
    fn.mockResolvedValueOnce(res as Response);
  }
  return fn;
}

function okResponse(data: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(data) };
}

function errorResponse(status: number, statusText: string) {
  return { ok: false, status, statusText, json: () => Promise.resolve({}) };
}

function sampleNoteData(overrides?: Partial<InternalNoteData>): InternalNoteData {
  return {
    destinationPhone: '09012345678',
    sendType: 'customer',
    templateName: '支払い確認テンプレート',
    messageBody: 'お支払いの確認をお願いします。',
    senderName: '田中太郎',
    sendTimestamp: new Date('2024-06-15T10:30:00.000Z'),
    sendResult: '成功',
    deliveryStatus: 'delivered',
    externalMessageId: 'ext-msg-001',
    ...overrides,
  };
}

// --- Tests ---

describe('ZendeskService', () => {
  describe('constructor', () => {
    it('should build correct base URL from subdomain', async () => {
      const mockFetch = vi.fn<FetchFn>();
      mockFetch.mockResolvedValue(okResponse({ ticket: { id: 1, subject: 'Test', status: 'open', requester_id: 100 } }) as Response);
      const service = new ZendeskService(defaultConfig, mockFetch);
      // Trigger a call to verify the URL
      try { await service.getTicketContext('1'); } catch { /* ignore incomplete mock */ }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://testcompany.zendesk.com/api/v2/tickets/1.json',
        expect.any(Object),
      );
    });

    it('should use Basic auth with email/token format', async () => {
      const mockFetch = vi.fn<FetchFn>();
      mockFetch.mockResolvedValue(okResponse({ ticket: { id: 1, subject: 'Test', status: 'open', requester_id: 100 } }) as Response);

      const service = new ZendeskService(defaultConfig, mockFetch);
      try { await service.getTicketContext('1'); } catch { /* ignore */ }

      const expectedCredentials = Buffer.from('agent@example.com/token:test-api-token-123').toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedCredentials}`,
          }),
        }),
      );
    });
  });

  describe('getTicketContext()', () => {
    it('should retrieve ticket and requester info successfully', async () => {
      const mockFetch = createMockFetch([
        okResponse({
          ticket: { id: 42, subject: 'Help needed', status: 'open', requester_id: 200, brand_id: 5 },
        }),
        okResponse({
          user: { id: 200, name: '山田花子', phone: '08098765432', email: 'hanako@example.com' },
        }),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);
      const ctx = await service.getTicketContext('42');

      expect(ctx).toEqual({
        ticketId: '42',
        subject: 'Help needed',
        requesterName: '山田花子',
        requesterPhone: '08098765432',
        requesterEmail: 'hanako@example.com',
        status: 'open',
        brand: '5',
      });
    });

    it('should call ticket API then user API in sequence', async () => {
      const mockFetch = createMockFetch([
        okResponse({ ticket: { id: 10, subject: 'Test', status: 'new', requester_id: 300 } }),
        okResponse({ user: { id: 300, name: 'User', phone: null, email: null } }),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);
      await service.getTicketContext('10');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1,
        'https://testcompany.zendesk.com/api/v2/tickets/10.json',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        'https://testcompany.zendesk.com/api/v2/users/300.json',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should handle requester without phone number', async () => {
      const mockFetch = createMockFetch([
        okResponse({ ticket: { id: 1, subject: 'No phone', status: 'open', requester_id: 100 } }),
        okResponse({ user: { id: 100, name: 'No Phone User', phone: null, email: 'user@test.com' } }),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);
      const ctx = await service.getTicketContext('1');

      expect(ctx.requesterPhone).toBeUndefined();
      expect(ctx.requesterEmail).toBe('user@test.com');
    });

    it('should handle ticket without brand_id', async () => {
      const mockFetch = createMockFetch([
        okResponse({ ticket: { id: 1, subject: 'No brand', status: 'pending', requester_id: 100 } }),
        okResponse({ user: { id: 100, name: 'User', phone: '09011112222' } }),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);
      const ctx = await service.getTicketContext('1');

      expect(ctx.brand).toBeUndefined();
    });

    it('should throw on ticket API error', async () => {
      const mockFetch = createMockFetch([
        errorResponse(404, 'Not Found'),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);

      await expect(service.getTicketContext('999')).rejects.toThrow('Zendesk API error: 404 Not Found');
    });

    it('should throw on user API error', async () => {
      const mockFetch = createMockFetch([
        okResponse({ ticket: { id: 1, subject: 'Test', status: 'open', requester_id: 100 } }),
        errorResponse(500, 'Internal Server Error'),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);

      await expect(service.getTicketContext('1')).rejects.toThrow('Zendesk API error: 500 Internal Server Error');
    });

    it('should encode ticketId in URL', async () => {
      const mockFetch = createMockFetch([
        okResponse({ ticket: { id: 1, subject: 'Test', status: 'open', requester_id: 100 } }),
        okResponse({ user: { id: 100, name: 'User' } }),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);
      await service.getTicketContext('123/456');

      expect(mockFetch).toHaveBeenNthCalledWith(1,
        'https://testcompany.zendesk.com/api/v2/tickets/123%2F456.json',
        expect.any(Object),
      );
    });
  });

  describe('createInternalNote()', () => {
    it('should create internal note with PUT request', async () => {
      const mockFetch = createMockFetch([
        okResponse({ ticket: {} }),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);
      await service.createInternalNote('42', sampleNoteData());

      expect(mockFetch).toHaveBeenCalledWith(
        'https://testcompany.zendesk.com/api/v2/tickets/42.json',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should send comment with public: false', async () => {
      const mockFetch = createMockFetch([
        okResponse({ ticket: {} }),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);
      await service.createInternalNote('42', sampleNoteData());

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]!.body as string);

      expect(requestBody.ticket.comment.public).toBe(false);
      expect(requestBody.ticket.comment.body).toContain('SMS送信記録');
    });

    it('should use formatted note as comment body', async () => {
      const mockFetch = createMockFetch([
        okResponse({ ticket: {} }),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);
      const noteData = sampleNoteData();
      await service.createInternalNote('42', noteData);

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1]!.body as string);
      const expectedBody = service.formatInternalNote(noteData);

      expect(requestBody.ticket.comment.body).toBe(expectedBody);
    });

    it('should throw on API error (Requirement 8.3)', async () => {
      const mockFetch = createMockFetch([
        errorResponse(422, 'Unprocessable Entity'),
      ]);

      const service = new ZendeskService(defaultConfig, mockFetch);

      await expect(
        service.createInternalNote('42', sampleNoteData()),
      ).rejects.toThrow('Zendesk API error: 422 Unprocessable Entity');
    });
  });

  describe('formatInternalNote()', () => {
    let service: ZendeskService;

    beforeEach(() => {
      service = new ZendeskService(defaultConfig, vi.fn() as unknown as FetchFn);
    });

    it('should format all required fields (Requirement 8.2)', () => {
      const note = service.formatInternalNote(sampleNoteData());

      expect(note).toContain('件名：SMS送信記録');
      expect(note).toContain('送信先電話番号： 09012345678');
      expect(note).toContain('送信種別： customer');
      expect(note).toContain('テンプレート名： 支払い確認テンプレート');
      expect(note).toContain('本文： お支払いの確認をお願いします。');
      expect(note).toContain('送信者： 田中太郎');
      expect(note).toContain('送信日時： 2024-06-15T10:30:00.000Z');
      expect(note).toContain('送信結果： 成功');
      expect(note).toContain('配信状況： delivered');
      expect(note).toContain('外部メッセージID： ext-msg-001');
    });

    it('should use consistent format template (Requirement 8.4)', () => {
      const note = service.formatInternalNote(sampleNoteData());
      const lines = note.split('\n');

      expect(lines).toHaveLength(10);
      expect(lines[0]).toBe('件名：SMS送信記録');
      expect(lines[1]).toMatch(/^送信先電話番号： /);
      expect(lines[2]).toMatch(/^送信種別： /);
      expect(lines[3]).toMatch(/^テンプレート名： /);
      expect(lines[4]).toMatch(/^本文： /);
      expect(lines[5]).toMatch(/^送信者： /);
      expect(lines[6]).toMatch(/^送信日時： /);
      expect(lines[7]).toMatch(/^送信結果： /);
      expect(lines[8]).toMatch(/^配信状況： /);
      expect(lines[9]).toMatch(/^外部メッセージID： /);
    });

    it('should show （なし） for optional templateName when not provided', () => {
      const note = service.formatInternalNote(sampleNoteData({ templateName: undefined }));

      expect(note).toContain('テンプレート名： （なし）');
    });

    it('should show （なし） for optional externalMessageId when not provided', () => {
      const note = service.formatInternalNote(sampleNoteData({ externalMessageId: undefined }));

      expect(note).toContain('外部メッセージID： （なし）');
    });

    it('should format sendTimestamp as ISO string', () => {
      const timestamp = new Date('2024-12-25T23:59:59.999Z');
      const note = service.formatInternalNote(sampleNoteData({ sendTimestamp: timestamp }));

      expect(note).toContain('送信日時： 2024-12-25T23:59:59.999Z');
    });

    it('should include all delivery status values correctly', () => {
      const statuses = ['queued', 'sent', 'delivered', 'failed', 'expired', 'unknown'] as const;

      for (const status of statuses) {
        const note = service.formatInternalNote(sampleNoteData({ deliveryStatus: status }));
        expect(note).toContain(`配信状況： ${status}`);
      }
    });

    it('should handle empty string values in fields', () => {
      const note = service.formatInternalNote(sampleNoteData({
        messageBody: '',
        senderName: '',
        sendResult: '',
      }));

      expect(note).toContain('本文： ');
      expect(note).toContain('送信者： ');
      expect(note).toContain('送信結果： ');
    });
  });
});
