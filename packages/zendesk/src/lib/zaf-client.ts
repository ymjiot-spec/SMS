/**
 * ZAF SDK Client Wrapper
 * Requirements: 7.1, 7.2, 7.3
 *
 * Zendesk Apps Framework (ZAF) SDK の初期化とチケット情報取得を提供する。
 * 開発環境では実際の SDK が利用できないため、型定義とフォールバックを含む。
 */

/** ZAF Client の型定義（SDK が提供する主要メソッド） */
export interface ZafClient {
  get(path: string): Promise<Record<string, unknown>>;
  set(path: string, value: unknown): Promise<void>;
  invoke(name: string, ...args: unknown[]): Promise<unknown>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  context(): Promise<{ ticketId?: string; location?: string }>;
  request(options: {
    url: string;
    type?: string;
    contentType?: string;
    data?: string;
    secure?: boolean;
    headers?: Record<string, string>;
  }): Promise<unknown>;
}

/** チケット情報 */
export interface TicketInfo {
  ticketId: string;
  subject: string;
  requesterName: string;
  requesterPhone: string;
}

/** グローバルの ZAFClient 関数の型宣言 */
declare global {
  interface Window {
    ZAFClient?: {
      init(): ZafClient;
    };
  }
}

let client: ZafClient | null = null;

/**
 * ZAF SDK を初期化してクライアントを返す。
 * SDK がロードされていない場合は null を返す。
 */
export function initZafClient(): ZafClient | null {
  if (client) return client;

  if (typeof window !== 'undefined' && window.ZAFClient) {
    client = window.ZAFClient.init();
    return client;
  }

  return null;
}

/**
 * 現在のチケット情報を ZAF SDK 経由で取得する。
 * SDK が利用できない場合は null を返す。
 */
export async function getTicketInfo(
  zafClient: ZafClient | null,
): Promise<TicketInfo | null> {
  if (!zafClient) return null;

  try {
    const data = await zafClient.get([
      'ticket.id',
      'ticket.subject',
      'ticket.requester.name',
      'ticket.requester.phone',
    ] as unknown as string);

    const ticketId = String(data['ticket.id'] ?? '');
    if (!ticketId || ticketId === 'undefined') return null;

    return {
      ticketId,
      subject: String(data['ticket.subject'] ?? ''),
      requesterName: String(data['ticket.requester.name'] ?? ''),
      requesterPhone: String(data['ticket.requester.phone'] ?? ''),
    };
  } catch (e) {
    console.error('[ZAF] getTicketInfo error:', e);
    return null;
  }

}
