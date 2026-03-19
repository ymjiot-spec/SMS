/**
 * ZendeskService - Zendesk連携サービス
 * Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4
 *
 * チケット情報取得、社内メモ作成、社内メモフォーマットを提供する。
 * Zendesk REST API (v2) を使用し、Basic認証（email/token）で接続する。
 */

import type { DeliveryStatus } from '@zendesk-sms-tool/shared';

/** Zendesk API 接続設定 */
export interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
}

/** チケットコンテキスト情報 */
export interface TicketContext {
  ticketId: string;
  subject: string;
  requesterName: string;
  requesterPhone?: string;
  requesterEmail?: string;
  status: string;
  brand?: string;
}

/** 社内メモデータ */
export interface InternalNoteData {
  destinationPhone: string;
  sendType: string;
  templateName?: string;
  messageBody: string;
  senderName: string;
  sendTimestamp: Date;
  sendResult: string;
  deliveryStatus: DeliveryStatus;
  externalMessageId?: string;
}

/** fetch 関数の型（テスト時に差し替え可能にする） */
export type FetchFn = typeof globalThis.fetch;

export class ZendeskService {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchFn: FetchFn;

  constructor(config: ZendeskConfig, fetchFn: FetchFn = globalThis.fetch) {
    this.baseUrl = `https://${config.subdomain}.zendesk.com`;
    // Basic auth: email/token:apiToken (base64 encoded)
    const credentials = `${config.email}/token:${config.apiToken}`;
    this.authHeader = `Basic ${Buffer.from(credentials).toString('base64')}`;
    this.fetchFn = fetchFn;
  }

  /**
   * チケットIDからチケット情報・顧客電話番号を取得する
   * Requirements: 7.1, 7.2, 7.3
   *
   * GET /api/v2/tickets/{id}.json でチケット情報を取得し、
   * requester の情報（名前、電話番号、メール）を抽出する。
   */
  async getTicketContext(ticketId: string): Promise<TicketContext> {
    // チケット情報を取得
    const ticketRes = await this.fetchFn(
      `${this.baseUrl}/api/v2/tickets/${encodeURIComponent(ticketId)}.json`,
      {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!ticketRes.ok) {
      throw new Error(`Zendesk API error: ${ticketRes.status} ${ticketRes.statusText}`);
    }

    const ticketData = (await ticketRes.json()) as {
      ticket: {
        id: number;
        subject: string;
        status: string;
        requester_id: number;
        brand_id?: number;
      };
    };

    const ticket = ticketData.ticket;

    // リクエスターの情報を取得
    const userRes = await this.fetchFn(
      `${this.baseUrl}/api/v2/users/${ticket.requester_id}.json`,
      {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!userRes.ok) {
      throw new Error(`Zendesk API error: ${userRes.status} ${userRes.statusText}`);
    }

    const userData = (await userRes.json()) as {
      user: {
        id: number;
        name: string;
        phone?: string | null;
        email?: string | null;
      };
    };

    const user = userData.user;

    return {
      ticketId: String(ticket.id),
      subject: ticket.subject,
      requesterName: user.name,
      requesterPhone: user.phone ?? undefined,
      requesterEmail: user.email ?? undefined,
      status: ticket.status,
      brand: ticket.brand_id ? String(ticket.brand_id) : undefined,
    };
  }

  /**
   * チケットに社内メモを作成する
   * Requirements: 8.1, 8.3, 8.4
   *
   * PUT /api/v2/tickets/{id}.json で社内メモ（public: false）を追加する。
   * 失敗時はエラーをスローするが、呼び出し元でSMS送信のロールバックは行わない。
   */
  async createInternalNote(ticketId: string, note: InternalNoteData): Promise<void> {
    const body = this.formatInternalNote(note);

    const res = await this.fetchFn(
      `${this.baseUrl}/api/v2/tickets/${encodeURIComponent(ticketId)}.json`,
      {
        method: 'PUT',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticket: {
            comment: {
              body,
              public: false,
            },
          },
        }),
      },
    );

    if (!res.ok) {
      throw new Error(`Zendesk API error: ${res.status} ${res.statusText}`);
    }
  }

  /**
   * 社内メモのフォーマット
   * Requirements: 8.2, 8.4
   *
   * 以下のフィールドを含む一貫したフォーマットで社内メモを生成する:
   * 送信先電話番号、送信種別、テンプレート名、本文、送信者、送信日時、
   * 送信結果、配信状況、外部メッセージID
   */
  formatInternalNote(data: InternalNoteData): string {
    const timestamp = data.sendTimestamp.toISOString();
    const templateName = data.templateName ?? '（なし）';
    const externalMessageId = data.externalMessageId ?? '（なし）';

    return [
      '件名：SMS送信記録',
      `送信先電話番号： ${data.destinationPhone}`,
      `送信種別： ${data.sendType}`,
      `テンプレート名： ${templateName}`,
      `本文： ${data.messageBody}`,
      `送信者： ${data.senderName}`,
      `送信日時： ${timestamp}`,
      `送信結果： ${data.sendResult}`,
      `配信状況： ${data.deliveryStatus}`,
      `外部メッセージID： ${externalMessageId}`,
    ].join('\n');
  }
}
