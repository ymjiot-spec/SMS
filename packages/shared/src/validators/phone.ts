/**
 * 日本の携帯電話番号バリデーション
 * Requirements: 1.4, 10.1
 *
 * 070/080/090 プレフィックス、11桁の数字のみ許可
 */

const JAPANESE_MOBILE_PATTERN = /^0[789]0\d{8}$/;

/**
 * 日本の携帯電話番号を検証する
 * @param phone - 検証する電話番号文字列
 * @returns 有効な日本の携帯電話番号の場合 true
 */
export function validateJapanesePhoneNumber(phone: string): boolean {
  return JAPANESE_MOBILE_PATTERN.test(phone);
}
