/**
 * スラッシュコマンド（定型文プロンプト）の定義
 */
export interface Command {
  key: string; // コマンドの識別子
  label: string; // 表示名
  description: string; // 説明
  prompt: string; // 挿入されるプロンプト定型文
}

export const SLASH_COMMANDS: Command[] = [
  {
    key: 'summary',
    label: '要約',
    description: '入力された内容を短く要約します',
    prompt: '以下の内容を、要点を絞って簡潔に要約してください：\n\n',
  },
  {
    key: 'translate',
    label: '翻訳（英訳）',
    description: '入力された内容を英語に翻訳します',
    prompt: '以下の内容を、自然な英語に翻訳してください：\n\n',
  },
  {
    key: 'explain',
    label: 'コード解説',
    description: 'プログラムコードの内容を詳しく説明します',
    prompt:
      '以下のコードについて、どのような処理を行っているか初心者にも分かりやすく解説してください：\n\n',
  },
  {
    key: 'fix',
    label: '校正',
    description: '文章の誤字脱字や表現を修正します',
    prompt: '以下の文章を校正し、より自然でプロフェッショナルな表現に修正してください：\n\n',
  },
];
