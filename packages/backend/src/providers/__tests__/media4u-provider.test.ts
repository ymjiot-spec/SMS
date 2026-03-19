import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Media4uProvider, Media4uApiError } from '../media4u-provider.js';
import type { Media4uConfig } from '../media4u-provider.js';
import type { SendMessageRequest } from '../sms-provider.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function textResponse(body: string, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

describe('Media4uProvider', () => {
  const validConfig: Media4uConfig = {
    apiUrl: 'https://www.sms-console.jp/api/',
    username: 'test_user',
    password: 'test_pass123',
  };

  const validRequest: SendMessageRequest = {
    to: '09012345678',
    body: 'テストメッセージ',
  };

  const fastRetryConfig = { maxRetries: 3, initialDelay: 1, maxDelay: 10 };

  let provider: Media4uProvider;

  beforeEach(() => {
    provider = new Media4uProvider(validConfig, fastRetryConfig);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendMessage', () => {
    it('should send successfully when API returns 200', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('200'));

      const result = await provider.sendMessage(validRequest);

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toBeDefined();
      expect(result.status).toBe('sent');
      expect(result.error).toBeUndefined();

      // Verify fetch was called with correct params
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://www.sms-console.jp/api/');
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

      const body = new URLSearchParams(init.body);
      expect(body.get('username')).toBe('test_user');
      expect(body.get('password')).toBe('test_pass123');
      expect(body.get('mobilenumber')).toBe('09012345678');
      expect(body.get('smstext')).toBe('テストメッセージ');
      expect(body.get('status')).toBe('1');
      expect(body.get('smsid')).toBeTruthy();
    });

    it('should return failure on auth error (401)', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('401'));

      const result = await provider.sendMessage(validRequest);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('401');
      expect(result.error?.message).toContain('認証エラー');
    });

    it('should return failure on invalid phone number (560)', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('560'));

      const result = await provider.sendMessage(validRequest);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('560');
      expect(result.error?.message).toContain('電話番号不正');
    });

    it('should return failure on invalid message body (585)', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('585'));

      const result = await provider.sendMessage(validRequest);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('585');
      expect(result.error?.message).toContain('本文不正');
    });

    it('should return failure on rate limit exceeded (597)', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('597'));

      const result = await provider.sendMessage(validRequest);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('597');
      expect(result.error?.message).toContain('送信制限超過');
    });

    it('should handle various error codes', async () => {
      const errorCodes: Array<[string, string]> = [
        ['550', '送信失敗'],
        ['551', '送信失敗'],
        ['559', 'タイムアウト'],
        ['590', 'パラメータ不正'],
        ['591', 'テンプレートID不正'],
        ['598', 'リクエスト不正'],
        ['599', 'システムエラー'],
      ];

      for (const [code, expectedMsg] of errorCodes) {
        mockFetch.mockResolvedValueOnce(textResponse(code));
        const result = await provider.sendMessage(validRequest);
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe(code);
        expect(result.error?.message).toContain(expectedMsg);
      }
    });
  });

  describe('retry on HTTP 5xx errors', () => {
    it('should retry on HTTP 500 and succeed on subsequent attempt', async () => {
      mockFetch
        .mockResolvedValueOnce(textResponse('', 500, 'Internal Server Error'))
        .mockResolvedValueOnce(textResponse('200'));

      const result = await provider.sendMessage(validRequest);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 502, 503, 504 status codes', async () => {
      for (const statusCode of [502, 503, 504]) {
        mockFetch.mockReset();
        mockFetch
          .mockResolvedValueOnce(textResponse('', statusCode, 'Server Error'))
          .mockResolvedValueOnce(textResponse('200'));

        const result = await provider.sendMessage(validRequest);
        expect(result.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      }
    });

    it('should exhaust retries and return failure after max retries', async () => {
      mockFetch.mockResolvedValue(textResponse('', 503, 'Service Unavailable'));

      const result = await provider.sendMessage(validRequest);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      // 1 initial + 3 retries = 4 total
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should retry on network errors (fetch TypeError)', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(textResponse('200'));

      const result = await provider.sendMessage(validRequest);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDeliveryStatus', () => {
    it('should return delivered status for code 200', async () => {
      mockFetch.mockResolvedValueOnce(
        textResponse('sms_123,200,2024-01-15T10:30:00Z'),
      );

      const result = await provider.getDeliveryStatus('sms_123');

      expect(result.externalMessageId).toBe('sms_123');
      expect(result.status).toBe('delivered');
      expect(result.rawResponse).toBeDefined();
    });

    it('should return failed status for code 550', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('sms_123,550,'));

      const result = await provider.getDeliveryStatus('sms_123');
      expect(result.status).toBe('failed');
    });

    it('should return expired status for code 559', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('sms_123,559,'));

      const result = await provider.getDeliveryStatus('sms_123');
      expect(result.status).toBe('expired');
    });

    it('should return unknown status on API error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.getDeliveryStatus('sms_123');

      expect(result.status).toBe('unknown');
      expect(result.externalMessageId).toBe('sms_123');
    });
  });

  describe('validateConfig', () => {
    it('should return valid for complete config', async () => {
      const result = await provider.validateConfig();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return error for empty username', async () => {
      const badProvider = new Media4uProvider({ ...validConfig, username: '' });
      const result = await badProvider.validateConfig();
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('username');
    });

    it('should return error for too short username', async () => {
      const badProvider = new Media4uProvider({ ...validConfig, username: 'a' });
      const result = await badProvider.validateConfig();
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('2-20');
    });

    it('should return error for empty password', async () => {
      const badProvider = new Media4uProvider({ ...validConfig, password: '' });
      const result = await badProvider.validateConfig();
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('password');
    });

    it('should return error for too short password', async () => {
      const badProvider = new Media4uProvider({ ...validConfig, password: 'abc' });
      const result = await badProvider.validateConfig();
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('6-20');
    });

    it('should return multiple errors for multiple invalid fields', async () => {
      const badProvider = new Media4uProvider({
        username: '',
        password: '',
      });
      const result = await badProvider.validateConfig();
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should use default API URL when not specified', async () => {
      const p = new Media4uProvider({ username: 'ab', password: '123456' });
      const result = await p.validateConfig();
      expect(result.valid).toBe(true);
    });
  });

  describe('Media4uApiError', () => {
    it('should have correct name and properties', () => {
      const error = new Media4uApiError('test error', 500, 'SERVER_ERROR');
      expect(error.name).toBe('Media4uApiError');
      expect(error.message).toBe('test error');
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe('SERVER_ERROR');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
