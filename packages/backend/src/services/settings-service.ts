/**
 * SettingsService - 設定管理サービス
 * Requirements: 11.4, 14.1
 *
 * システム設定（SMSプロバイダ、Webhook、テスト電話番号、レート制限、Zendesk連携）の
 * 取得・更新を管理する。設定はインメモリストアに保持し、環境変数からデフォルト値を読み込む。
 */

import type { AuditService } from './audit-service.js';

export interface SmsProviderSettings {
  name: string;
  apiKey: string;
  endpoint: string;
}

export interface WebhookSettings {
  url: string;
  secret: string;
}

export interface ZendeskIntegrationSettings {
  subdomain: string;
  email: string;
  apiToken: string;
}

export interface SystemSettings {
  smsProvider: SmsProviderSettings;
  webhook: WebhookSettings;
  testPhoneNumber: string;
  rateLimitPerMinute: number;
  zendeskIntegration: ZendeskIntegrationSettings;
}

function loadDefaults(): SystemSettings {
  return {
    smsProvider: {
      name: process.env.SMS_PROVIDER_NAME ?? 'mock',
      apiKey: process.env.SMS_PROVIDER_API_KEY ?? '',
      endpoint: process.env.SMS_PROVIDER_ENDPOINT ?? '',
    },
    webhook: {
      url: process.env.WEBHOOK_URL ?? '',
      secret: process.env.WEBHOOK_SECRET ?? '',
    },
    testPhoneNumber: process.env.TEST_PHONE_NUMBER ?? '09000000000',
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE) || 10,
    zendeskIntegration: {
      subdomain: process.env.ZENDESK_SUBDOMAIN ?? '',
      email: process.env.ZENDESK_EMAIL ?? '',
      apiToken: process.env.ZENDESK_API_TOKEN ?? '',
    },
  };
}

export class SettingsService {
  private settings: SystemSettings;

  constructor(private readonly auditService: AuditService) {
    this.settings = loadDefaults();
  }

  /**
   * 現在のシステム設定を取得する
   */
  getSettings(): SystemSettings {
    return structuredClone(this.settings);
  }

  /**
   * システム設定を更新し、監査ログに記録する
   */
  async updateSettings(
    userId: string,
    updates: Partial<SystemSettings>,
    ipAddress?: string,
  ): Promise<SystemSettings> {
    const before = structuredClone(this.settings);

    if (updates.smsProvider) {
      this.settings.smsProvider = { ...this.settings.smsProvider, ...updates.smsProvider };
    }
    if (updates.webhook) {
      this.settings.webhook = { ...this.settings.webhook, ...updates.webhook };
    }
    if (updates.testPhoneNumber !== undefined) {
      this.settings.testPhoneNumber = updates.testPhoneNumber;
    }
    if (updates.rateLimitPerMinute !== undefined) {
      this.settings.rateLimitPerMinute = updates.rateLimitPerMinute;
    }
    if (updates.zendeskIntegration) {
      this.settings.zendeskIntegration = {
        ...this.settings.zendeskIntegration,
        ...updates.zendeskIntegration,
      };
    }

    const after = structuredClone(this.settings);

    // 監査ログ記録
    await this.auditService.log({
      userId,
      action: 'config_change',
      resourceType: 'settings',
      resourceId: 'system-settings',
      details: { before, after },
      ipAddress,
    });

    return after;
  }
}
