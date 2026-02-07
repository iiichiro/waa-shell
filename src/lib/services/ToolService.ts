import type OpenAI from 'openai';
import { useAppStore } from '../../store/useAppStore';
import type { McpAppUiData } from '../db';
import { executeMcpToolWithMetadata, getAllMcpTools } from './McpService';

/**
 * ローカルツールの定義インターフェース
 */
export interface LocalToolContext {
  threadId: number;
  modelId: string;
}

export interface LocalTool {
  id: string;
  name: string;
  description: string;
  schema: OpenAI.Chat.ChatCompletionTool;
  execute: (args: unknown, context: LocalToolContext) => Promise<string>;
}

// import { chatCompletion } from './ModelService';

// ローカルツールのレジストリ
const localToolRegistry: LocalTool[] = [
  // TODO: サブエージェント機能はもう少し練ってから実装する
  // {
  //   id: 'subagent',
  //   name: 'サブエージェント',
  //   description:
  //     '別のAIエージェントに特定のタスクを依頼します。独立したコンテキストで実行されます。',
  //   schema: {
  //     type: 'function',
  //     function: {
  //       name: 'subagent',
  //       description: '別のAIエージェントに特定のタスクを依頼します。',
  //       parameters: {
  //         type: 'object',
  //         properties: {
  //           input: {
  //             type: 'string',
  //             description: 'エージェントへの具体的な依頼内容',
  //           },
  //           systemPrompt: {
  //             type: 'string',
  //             description: 'エージェントに守ってほしいルールなど（省略可能）',
  //           },
  //         },
  //         required: ['input'],
  //       },
  //     },
  //   },
  //   execute: async (args: unknown, context: LocalToolContext) => {
  //     const { input, systemPrompt } = args as {
  //       input: string;
  //       systemPrompt?: string;
  //     };
  //     const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  //     if (systemPrompt) {
  //       messages.push({ role: 'system', content: systemPrompt });
  //     }
  //     messages.push({ role: 'user', content: input });
  //     const maxSteps = 10;
  //     let currentStep = 0;
  //     try {
  //       // サブエージェント自身を除外したツール定義を取得
  //       const tools = await getToolDefinitions({ excludeIds: ['subagent'] });
  //       while (currentStep < maxSteps) {
  //         const response = (await chatCompletion({
  //           model: context.modelId,
  //           messages,
  //           stream: false,
  //           tools: tools.length > 0 ? tools : undefined,
  //         })) as OpenAI.Chat.ChatCompletion;
  //         const message = response.choices[0].message;
  //         messages.push(message);
  //         if (message.tool_calls && message.tool_calls.length > 0) {
  //           for (const toolCall of message.tool_calls) {
  //             if (toolCall.type !== 'function') continue;
  //             const toolResult = await executeTool(
  //               toolCall.function.name,
  //               JSON.parse(toolCall.function.arguments),
  //               context,
  //             );
  //             messages.push({
  //               role: 'tool',
  //               tool_call_id: toolCall.id,
  //               content: toolResult,
  //             });
  //           }
  //           currentStep++;
  //           continue;
  //         }
  //         return message.content || '（回答なし）';
  //       }
  //       return 'エラー: 最大ステップ数を超過しました。';
  //     } catch (error) {
  //       return `エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
  //     }
  //   },
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
export async function getToolDefinitions(
  options: { excludeIds?: string[] } = {},
): Promise<OpenAI.Chat.ChatCompletionTool[]> {
  const { enabledTools, enabledBuiltInTools } = useAppStore.getState();
  const excludeIds = options.excludeIds || [];

  // 有効かつ除外されていないローカルツールのみをフィルタリング
  const activeLocalTools = localToolRegistry.filter(
    (tool) => enabledTools[tool.id] !== false && !excludeIds.includes(tool.id),
  );

  const localToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = activeLocalTools.map(
    (t) => t.schema,
  );

  // 組み込みツールの追加
  const builtInToolDefinitions: OpenAI.Chat.ChatCompletionTool[] = [];
  if (enabledBuiltInTools.web_search) {
    // LiteLLM / OpenAI の最新仕様に合わせて type: 'web_search' を使用する
    // OpenAI SDKの型定義に含まれていない可能性があるため、型アサーションを使用
    builtInToolDefinitions.push({
      type: 'web_search',
    } as unknown as OpenAI.Chat.ChatCompletionTool);
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
  context: LocalToolContext,
): Promise<ToolExecutionResult> {
  console.log(`Executing tool with metadata: ${name}`, args, context);

  // ローカルツールの実行
  const localTool = localToolRegistry.find(
    (t) => (t.schema as { function?: { name: string } }).function?.name === name,
  );
  if (localTool) {
    const content = await localTool.execute(args, context);
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
export async function executeTool(
  name: string,
  args: unknown,
  context: LocalToolContext,
): Promise<string> {
  const result = await executeToolWithMetadata(name, args, context);
  return result.content;
}
