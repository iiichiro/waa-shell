import type OpenAI from 'openai';
import { executeMcpTool, getAllMcpTools } from './McpService';

/**
 * AI に提供するツール定義（OpenAI形式）のリストを取得
 */
export async function getToolDefinitions(): Promise<OpenAI.Chat.ChatCompletionTool[]> {
  const localTools: OpenAI.Chat.ChatCompletionTool[] = [
    // 例：
    // TIPS： executeTool 関数に判定処理および実際の処理を追加する必要がある
    // {
    //   type: 'function',
    //   function: {
    //     name: 'get_current_time',
    //     description: '現在の日時を取得します。',
    //     parameters: {
    //       type: 'object',
    //       properties: {},
    //     },
    //   },
    // },
  ];

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

  return [...localTools, ...mcpTools];
}

/**
 * ツールを実行する
 */
export async function executeTool(name: string, args: unknown): Promise<string> {
  console.log(`Executing tool: ${name}`, args);

  // ローカルツールの判定
  // 例：
  // if (name === 'get_current_time') {
  //   return new Date().toLocaleString('ja-JP');
  // }

  // MCP ツールの判定 (server__tool 形式)
  if (name.includes('__')) {
    const [serverName, ...toolNameParts] = name.split('__');
    const toolName = toolNameParts.join('__');
    return executeMcpTool(serverName, toolName, args);
  }

  return `Tool ${name} is not implemented yet.`;
}
