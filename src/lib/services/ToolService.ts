import type OpenAI from 'openai';
import { useAppStore } from '../../store/useAppStore';
import type { McpAppUiData } from '../db';
import { executeMcpToolWithMetadata, getAllMcpTools } from './McpService';

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
  // {
  //   id: 'get_current_time',
  //   name: '現在時刻取得',
  //   description: '現在の日時を取得します。',
  //   schema: {
  //     type: 'function',
  //     function: {
  //       name: 'get_current_time',
  //       description: '現在の日時を取得します。',
  //       parameters: {
  //         type: 'object',
  //         properties: {},
  //       },
  //     },
  //   },
  //   execute: async () => new Date().toLocaleString('ja-JP'),
  // },
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
  const { enabledTools, enabledBuiltInTools } = useAppStore.getState();

  // 有効なローカルツールのみをフィルタリング
  const activeLocalTools = localToolRegistry.filter(
    (tool) => enabledTools[tool.id] !== false, // デフォルトは有効とする
  );

  const localToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = activeLocalTools.map(
    (t) => t.schema,
  );

  // 組み込みツールの追加
  const builtInToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [];
  if (enabledBuiltInTools.web_search) {
    // web_search はプロバイダーごとに形式が異なるため、ここではマーカーとして共通の形式で入れるか、
    // プロバイダー側でこの名前を見て置換するようにする。
    // ここでは OpenAI SDK の型に合わせつつ、名前を 'web_search' とする。
    builtInToolDefinitions.push({
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Web 検索を実行して最新の情報を取得します。',
        parameters: {
          type: 'object',
          properties: {
            queries: {
              type: 'array',
              items: { type: 'string' },
              description: '検索クエリのリスト',
            },
          },
          required: ['queries'],
        },
      },
    });
  }

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

  return [...localToolDefinitions, ...builtInToolDefinitions, ...mcpTools];
}

/**
 * ツール実行結果（メタデータ付き）
 */
export interface ToolExecutionResult {
  content: string;
  mcpAppUi?: McpAppUiData;
}

/**
 * ツールを実行する（メタデータ付き）
 */
export async function executeToolWithMetadata(
  name: string,
  args: unknown,
): Promise<ToolExecutionResult> {
  console.log(`Executing tool with metadata: ${name}`, args);

  // ローカルツールの実行
  const localTool = localToolRegistry.find(
    (t) => (t.schema as { function?: { name: string } }).function?.name === name,
  );
  if (localTool) {
    const content = await localTool.execute(args);
    return { content };
  }

  // MCP ツールの判定 (server__tool 形式)
  if (name.includes('__')) {
    const [serverName, ...toolNameParts] = name.split('__');
    const toolName = toolNameParts.join('__');
    const mcpResult = await executeMcpToolWithMetadata(serverName, toolName, args);
    return {
      content: mcpResult.content,
      mcpAppUi: mcpResult.mcpAppUi,
    };
  }

  return {
    content: `Tool ${name} is not implemented yet.`,
  };
}

/**
 * ツールを実行する（後方互換性のため文字列を返すラッパー）
 */
export async function executeTool(name: string, args: unknown): Promise<string> {
  const result = await executeToolWithMetadata(name, args);
  return result.content;
}
