import { db, type SlashCommand } from '../db';

/**
 * スラッシュコマンド（動的テンプレート）を管理するサービス
 */

/**
 * 新規コマンドの作成または更新
 */
export async function upsertSlashCommand(
  command: Omit<SlashCommand, 'id' | 'createdAt' | 'updatedAt'>,
) {
  const existing = await db.slashCommands.where('key').equals(command.key).first();
  const now = new Date();

  if (existing && existing.id !== undefined) {
    return db.slashCommands.update(existing.id, {
      ...command,
      updatedAt: now,
    });
  }

  return db.slashCommands.add({
    ...command,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * コマンド一覧を取得
 */
export async function listSlashCommands() {
  return db.slashCommands.orderBy('key').toArray();
}

/**
 * コマンドの削除
 */
export async function deleteSlashCommand(id: number) {
  return db.slashCommands.delete(id);
}

/**
 * テンプレート文字列内の変数を置換する
 * @param content テンプレート文字列 (例: "Hello {{name}}")
 * @param variables 変数名と値のマップ (例: { name: "World" })
 */
export function fillTemplate(content: string, variables: Record<string, string>) {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    // 同一変数が複数箇所にあっても全て置換する (/g フラグ)
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

/**
 * テンプレート文字列から変数を自動抽出する
 * @param content テンプレート文字列
 */
export function extractVariables(content: string): string[] {
  const regex = /{{(.*?)}}/g;
  const matches = content.matchAll(regex);
  const variables = new Set<string>();
  for (const match of matches) {
    variables.add(match[1].trim());
  }
  return Array.from(variables);
}

/**
 * 初期シードデータとしてのプリセットコマンドを登録
 */
export async function seedSlashCommands() {
  const count = await db.slashCommands.count();
  if (count > 0) return;

  const presets: Omit<SlashCommand, 'id' | 'createdAt' | 'updatedAt'>[] = [
    // 例：
    // {
    //   key: 'summary',
    //   label: '要約',
    //   description: '入力された内容を短く要約します',
    //   content: '以下の内容を、{{target}}に重点を置いて簡潔に要約してください：\n\n{{text}}',
    //   variables: [
    //     { name: 'target', label: '重視する点', description: '要約の切り口', defaultValue: '全体' },
    //     { name: 'text', label: '対象テキスト', description: '要約したい本文', defaultValue: '' },
    //   ],
    // },
    // {
    //   key: 'translate',
    //   label: '翻訳（英訳）',
    //   description: '入力された内容を英語に翻訳します',
    //   content:
    //     '以下の「{{text}}」を、{{tone}}なニュアンスの自然な英語に翻訳してください：\n\n{{text}}',
    //   variables: [
    //     { name: 'text', label: '原文', description: '翻訳したい日本語', defaultValue: '' },
    //     {
    //       name: 'tone',
    //       label: 'トーン',
    //       description: '丁寧、カジュアル、ビジネス等',
    //       defaultValue: 'ビジネス',
    //     },
    //   ],
    // },
  ];

  for (const p of presets) {
    await upsertSlashCommand(p);
  }
}
