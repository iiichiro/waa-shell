import type OpenAI from 'openai';
import { useAppStore } from '../../store/useAppStore';
import { executeMcpTool, getAllMcpTools } from './McpService';

/**
 * ローカルツールの定義インターフェース
 */
export interface LocalTool {
  id: string;
  name: string;
  description: string;
  schema: OpenAI.Chat.ChatCompletionTool;
  execute: (args: unknown) => Promise<string>;
}

// ローカルツールのレジストリ
const localToolRegistry: LocalTool[] = [
  // ここにローカルツールを追加していく
  {
    id: 'get_current_time',
    name: '現在時刻取得',
    description: '現在の日時を取得します。',
    schema: {
      type: 'function',
      function: {
        name: 'get_current_time',
        description: '現在の日時を取得します。',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    execute: async () => new Date().toLocaleString('ja-JP'),
  },
];

/**
 * 登録されているローカルツール一覧を取得
 */
export function getLocalTools(): LocalTool[] {
  return localToolRegistry;
}

/**
 * AI に提供するツール定義（OpenAI形式）のリストを取得
 */
export async function getToolDefinitions(): Promise<OpenAI.Chat.ChatCompletionTool[]> {
  const { enabledTools } = useAppStore.getState();

  // 有効なローカルツールのみをフィルタリング
  const activeLocalTools = localToolRegistry.filter(
    (tool) => enabledTools[tool.id] !== false, // デフォルトは有効とする
  );

  const localToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = activeLocalTools.map(
    (t) => t.schema,
  );

  // MCP サーバから取得したツールを追加
  const mcpToolsRaw = await getAllMcpTools();
  const mcpTools: OpenAI.Chat.ChatCompletionTool[] = mcpToolsRaw.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: (t.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
    },
  }));

  return [...localToolDefinitions, ...mcpTools];
}

/**
 * ツールを実行する
 */
export async function executeTool(name: string, args: unknown): Promise<string> {
  console.log(`Executing tool: ${name}`, args);

  // ローカルツールの実行
  const localTool = localToolRegistry.find(
    (t) => (t.schema as { function?: { name: string } }).function?.name === name,
  );
  if (localTool) {
    return localTool.execute(args);
  }

  // MCP ツールの判定 (server__tool 形式)
  if (name.includes('__')) {
    const [serverName, ...toolNameParts] = name.split('__');
    const toolName = toolNameParts.join('__');
    return executeMcpTool(serverName, toolName, args);
  }

  return `Tool ${name} is not implemented yet.`;
}
