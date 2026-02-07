/**
 * 設定・ロジック関連の定数定義
 */
import type { ProviderType } from '../db';

/** モデルのツールサポートが不明な場合のデフォルト値 */
export const DEFAULT_SUPPORTS_TOOLS = true;

/** モデルの画像サポートが不明な場合のデフォルト値 */
export const DEFAULT_SUPPORTS_IMAGES = true;

/** 入力履歴の最大保持件数 */
export const MAX_INPUT_HISTORY = 50;

/** ストリーミングのデフォルト有効状態 */
export const DEFAULT_ENABLE_STREAM = true;

/** 送信ショートカットのデフォルト設定 */
export const DEFAULT_SEND_SHORTCUT = 'ctrl-enter';

/** テーマのデフォルト設定 */
export const DEFAULT_THEME = 'system';

/** タイトル自動生成のデフォルト有効状態 */
export const DEFAULT_AUTO_GENERATE_TITLE = false;

/** 要約・新規チャットのデフォルト有効状態 */
export const DEFAULT_ENABLE_SUMMARIZE_AND_NEW_CHAT = false;

/** プロトコルのデフォルト設定 */
export const DEFAULT_PROTOCOL = 'chat_completion';

/** ツールサポートのデフォルト無効プロバイダー */
export const DEFAULT_DISABLED_SUPPORTS_TOOLS_PROVIDERS: ProviderType[] = ['ollama'] as const;
