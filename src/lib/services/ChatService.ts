import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type {
  Response,
  ResponseCreateParams,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import { DEFAULT_SUPPORTS_IMAGES, DEFAULT_SUPPORTS_TOOLS } from '../constants/ConfigConstants';
import { db, type Message } from '../db';
import { getActivePathMessages } from '../db/threads';
import { dataURLToBlob } from '../utils/image';
import { fileToBase64 } from './FileService';
import { chatCompletion, createResponse, listModels } from './ModelService';
import { executeTool, getToolDefinitions } from './ToolService';

interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

interface ExtendedChatCompletionMessage {
  reasoning_content?: string;
  thinking_blocks?: ThinkingBlock[];
}

interface ExtendedChatCompletionDelta {
  content?: string | null | unknown[];
  reasoning_content?: string;
  image_url?: { url: string };
  images?: { image_url: { url: string } }[];
  tool_calls?: unknown[];
}

/**
 * スレッドを削除し、関連するデータ（メッセージ、ファイル、設定）をすべて削除する
 */
export async function deleteThread(threadId: number): Promise<void> {
  await db.transaction('rw', db.threads, db.messages, db.files, db.threadSettings, async () => {
    // 関連データを削除
    await db.messages.where('threadId').equals(threadId).delete();
    await db.files.where('threadId').equals(threadId).delete();
    await db.threadSettings.where('threadId').equals(threadId).delete();
    // スレッド本体を削除
    await db.threads.delete(threadId);
  });
}

/**
 * 複数のスレッドを一括削除する
 */
export async function deleteMultipleThreads(threadIds: number[]): Promise<void> {
  await db.transaction('rw', db.threads, db.messages, db.files, db.threadSettings, async () => {
    await db.messages.where('threadId').anyOf(threadIds).delete();
    await db.files.where('threadId').anyOf(threadIds).delete();
    await db.threadSettings.where('threadId').anyOf(threadIds).delete();
    await db.threads.where('id').anyOf(threadIds).delete();
  });
}

/**
 * チャット履歴とスレッドの永続化を担当するサービス
 */
export async function createThread(
  title: string,
  settings?: {
    providerId?: string;
    modelId?: string;
    systemPrompt?: string;
    contextWindow?: number;
    maxTokens?: number;
    extraParams?: Record<string, unknown>;
  },
): Promise<number> {
  const now = new Date();

  return db.transaction('rw', db.threads, db.threadSettings, async () => {
    const threadId = await db.threads.add({
      title,
      createdAt: now,
      updatedAt: now,
    });

    if (settings) {
      await db.threadSettings.add({
        threadId,
        providerId: settings.providerId,
        modelId: settings.modelId || '',
        systemPrompt: settings.systemPrompt,
        contextWindow: settings.contextWindow,
        maxTokens: settings.maxTokens,
        extraParams: settings.extraParams,
      });
    }

    return threadId;
  });
}

/**
 * メッセージを特定のスレッドに保存し、AIの回答を取得して保存する
 */
export async function sendMessage(
  threadId: number,
  content: string,
  requestModelId: string,
  options: {
    stream?: boolean;
    attachments?: File[];
    parentId?: number | null;
    onUserMessageSaved?: (messageId: number | null | undefined) => void;
    onChunk?: (chunk: string) => void;
    signal?: AbortSignal;
  } = {},
): Promise<Message | AsyncIterable<ChatCompletionChunk>> {
  const threadSetting = await db.threadSettings.where({ threadId }).first();
  const modelId = threadSetting?.modelId || requestModelId;
  const providerId = threadSetting?.providerId;

  // 0. モデルの有効状態をチェック
  // プロバイダー指定がある場合はそのプロバイダーのモデルリストを取得してチェックすべきだが
  // listModelsは全結合リストを返す仕様なのでfindで探す。
  // ただし、ManualModelの場合はproviderId情報はlistModelsの結果に含まれている。
  const allModels = await listModels();
  // モデルIDとプロバイダーで一致するものを探す（もしproviderIdがあれば）
  const currentModel = allModels.find(
    (m) => m.id === modelId && (!providerId || m.providerId === providerId),
  );
  if (currentModel && !currentModel.isEnabled) {
    throw new Error(`モデル「${currentModel.name}」は無効化されているため送信できません。`);
  }

  // プロバイダーオブジェクトの取得
  let specificProvider: import('../db').Provider | undefined;

  // スレッド設定のプロバイダーID、またはモデル情報からプロバイダーIDを特定
  const targetProviderId = providerId || currentModel?.providerId;

  if (targetProviderId) {
    specificProvider = await db.providers.get(Number(targetProviderId));
  }

  const now = new Date();

  const thread = await db.threads.get(threadId);
  if (!thread) throw new Error('Thread not found');

  const systemPrompt = threadSetting?.systemPrompt;
  const maxTokens = threadSetting?.maxTokens;
  const contextWindow = threadSetting?.contextWindow;
  const extraParams = threadSetting?.extraParams;

  // 1. ユーザーメッセージをDBに保存
  // parentId が undefined の場合は最新(activeLeafId)を、null の場合はルートを意味する
  let currentParentId = options.parentId === undefined ? thread.activeLeafId : options.parentId;

  // UI/UX改善: もし現在のアクティブなリーフと起点が異なる場合、即座に更新して表示を切り替える
  // これにより再送時に古いメッセージが即座に消える
  if (currentParentId !== thread.activeLeafId) {
    await db.threads.update(threadId, { activeLeafId: currentParentId ?? null });
  }

  let userMessageId: number | undefined;

  if (content || (options.attachments && options.attachments.length > 0)) {
    const userMessage: Message = {
      threadId,
      role: 'user',
      content,
      parentId: currentParentId,
      createdAt: now,
    };
    userMessageId = await db.messages.add(userMessage);
    currentParentId = userMessageId;
    await db.threads.update(threadId, { updatedAt: now, activeLeafId: userMessageId });

    if (options.attachments && options.attachments.length > 0 && userMessageId) {
      const { saveFile } = await import('./FileService');
      for (const file of options.attachments) {
        await saveFile(file, file.name, {
          threadId,
          messageId: userMessageId,
        });
      }
    }
  }

  // コールバックがあれば即座に呼び出す（UI更新用）
  if (options.onUserMessageSaved) {
    options.onUserMessageSaved(currentParentId);
  }

  while (true) {
    // アクティブなパス（ブランチ）に絞って履歴を取得
    // 保存したユーザーメッセージ（または指定された起点）を含む履歴を取得
    let history = await getActivePathMessages(threadId, currentParentId);

    if (contextWindow && contextWindow > 0 && history.length > contextWindow) {
      history = history.slice(-contextWindow);
    }
    const messagesForAi: ChatCompletionMessageParam[] = [];

    const modelName = currentModel ? currentModel.name : modelId;
    // デフォルトは定数として扱う（不明なモデルの場合など）
    const supportsTools = currentModel
      ? currentModel.supportsTools !== false
      : DEFAULT_SUPPORTS_TOOLS;
    const supportsImages = currentModel
      ? currentModel.supportsImages !== false
      : DEFAULT_SUPPORTS_IMAGES;
    const protocol = currentModel?.protocol || 'chat_completion';

    if (systemPrompt) {
      messagesForAi.push({ role: 'system', content: systemPrompt });
    }

    for (const m of history) {
      if (m.tool_calls && m.tool_calls.length > 0) {
        messagesForAi.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.tool_calls,
        });
        continue;
      }

      if (m.role === 'tool') {
        messagesForAi.push({
          role: 'tool',
          content: m.content || '',
          tool_call_id: m.tool_call_id || '',
        });
        continue;
      }

      const contentParts: ChatCompletionContentPart[] = [{ type: 'text', text: m.content || '' }];
      if (m.id !== undefined) {
        const files = await db.files.where('messageId').equals(m.id).toArray();
        for (const file of files) {
          if (file.id !== undefined && file.mimeType.startsWith('image/')) {
            // 画像対応モデルかつ画像ファイルの場合のみ追加
            if (supportsImages) {
              const { base64 } = await fileToBase64(file.id);
              contentParts.push({
                type: 'image_url',
                image_url: { url: `data:${file.mimeType};base64,${base64}` },
              });
            }
          }
        }
      }

      if (contentParts.length > 1) {
        messagesForAi.push({
          role: m.role as 'user' | 'assistant' | 'system', // cast for safety
          content: contentParts,
        } as ChatCompletionMessageParam);
      } else {
        messagesForAi.push({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content || '',
        } as ChatCompletionMessageParam);
      }
    }

    // ツール定義の取得制御
    // supportsToolsがtrueの場合のみツールを取得して渡す
    const tools = supportsTools ? await getToolDefinitions() : [];

    if (protocol === 'response_api') {
      try {
        // Convert messagesForAi to Response API (Input) format
        const inputItems = messagesForAi.map((m) => {
          if (m.role === 'system') {
            return {
              role: 'system',
              content: [{ type: 'input_text', text: m.content as string }],
            };
          }
          if (m.role === 'user') {
            if (typeof m.content === 'string') {
              return {
                role: 'user',
                content: [{ type: 'input_text', text: m.content }],
              };
            }
            return {
              role: 'user',
              content: (m.content as ChatCompletionContentPart[]).map((c) => ({
                ...c,
                type: c.type === 'text' ? 'input_text' : c.type,
              })),
            };
          }
          if (m.role === 'assistant') {
            return {
              role: 'assistant',
              content:
                typeof m.content === 'string'
                  ? [{ type: 'input_text', text: m.content }]
                  : (m.content as ChatCompletionContentPart[]).map((c) => ({
                      ...c,
                      type: c.type === 'text' ? 'input_text' : c.type,
                    })),
              tool_calls: m.tool_calls,
            };
          }
          if (m.role === 'tool') {
            return {
              role: 'tool',
              tool_call_id: m.tool_call_id,
              content: [{ type: 'input_text', text: m.content as string }],
            };
          }
          // Default fallback
          return {
            role: 'user',
            content: [{ type: 'input_text', text: '' }],
          };
        });

        const result = await createResponse({
          model: modelId,
          input: inputItems as unknown as ResponseCreateParams['input'],
          stream: options.stream,
          tools: tools.length > 0 ? tools : undefined,
          max_tokens: maxTokens,
          extraParams: extraParams,
          signal: options.signal,
        });

        if (options.stream && result != null && Symbol.asyncIterator in result) {
          return handleResponseStream(
            threadId,
            modelId,
            modelName,
            currentParentId,
            result as AsyncIterable<ResponseStreamEvent>,
            options,
          );
        }

        let content = '';
        let reasoningSummary = '';
        const responseToolCalls: {
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }[] = [];
        let outputItems: NonNullable<Response['output']> = [];

        // Non-streaming Case
        const response = result as Response;
        outputItems = response.output || [];

        for (const item of outputItems) {
          if (item.type === 'message' && item.content) {
            for (const c of item.content) {
              if (c.type === 'output_text') content += c.text;
            }
          } else if (item.type === 'reasoning' && item.summary) {
            for (const s of item.summary) {
              if (s.type === 'summary_text') reasoningSummary += s.text;
            }
          } else if (item.type === 'function_call') {
            responseToolCalls.push({
              id: item.id || `call_${Math.random().toString(36).slice(2, 11)}`,
              type: 'function' as const,
              function: {
                name: item.name || '',
                arguments: item.arguments || '{}',
              },
            });
          }
        }

        if (responseToolCalls.length > 0) {
          const assistantId = await db.messages.add({
            threadId,
            role: 'assistant',
            content: content || '', // Tool calls might come with empty content
            reasoningSummary: reasoningSummary,
            tool_calls: responseToolCalls,
            model: modelName,
            parentId: currentParentId,
            createdAt: new Date(),
          });
          currentParentId = assistantId;
          await db.threads.update(threadId, { activeLeafId: assistantId });

          for (const toolCall of responseToolCalls) {
            let toolResult = '';
            try {
              const args = JSON.parse(toolCall.function.arguments);
              toolResult = await executeTool(toolCall.function.name, args);
            } catch (e) {
              toolResult = `Error: ${String(e)}`;
            }

            const toolId = await db.messages.add({
              threadId,
              role: 'tool',
              content: toolResult,
              tool_call_id: toolCall.id,
              parentId: currentParentId,
              createdAt: new Date(),
            });
            currentParentId = toolId;
            await db.threads.update(threadId, { activeLeafId: toolId });
          }
          continue; // Loop again with tool results
        }

        // Save Assistant Message (No tools)
        const assistantMessage: Message = {
          threadId,
          role: 'assistant',
          content: content || '(No content)',
          reasoningSummary: reasoningSummary,
          parentId: currentParentId,
          model: modelName,
          createdAt: new Date(),
        };

        const finalId = await db.messages.add(assistantMessage);

        // AI応答から画像を抽出して保存
        await extractAndSaveImages(
          threadId,
          finalId,
          outputItems as unknown as Record<string, unknown>[],
        );

        await db.threads.update(threadId, { activeLeafId: finalId });
        assistantMessage.id = finalId;
        return assistantMessage;
      } catch (error) {
        console.error('Response API Error:', error);
        const errorMessage: Message = {
          threadId,
          role: 'assistant',
          content: `エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
          parentId: currentParentId,
          model: 'system',
          createdAt: new Date(),
        };
        const errorId = await db.messages.add(errorMessage);
        await db.threads.update(threadId, { activeLeafId: errorId });
        errorMessage.id = errorId;
        return errorMessage;
      }
    }

    // Default: Chat Completion
    try {
      const response = await chatCompletion({
        model: modelId,
        messages: messagesForAi,
        stream: options.stream,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: maxTokens,
        extraParams: extraParams,
        provider: specificProvider, // pass the resolved provider
        signal: options.signal,
      });

      if (options.stream && response != null && Symbol.asyncIterator in response) {
        return handleStreamResponse(
          threadId,
          modelId,
          modelName,
          currentParentId,
          response as AsyncIterable<ChatCompletionChunk>,
        );
      }

      const result = response as ChatCompletion;
      const message = result.choices[0].message;

      // Extract reasoning if available
      const msgAny = message as ChatCompletionMessage & ExtendedChatCompletionMessage;
      let reasoning = msgAny.reasoning_content || '';
      if (msgAny.thinking_blocks && Array.isArray(msgAny.thinking_blocks)) {
        reasoning = (msgAny.thinking_blocks as ThinkingBlock[])
          .filter((b: ThinkingBlock) => b.type === 'thinking')
          .map((b: ThinkingBlock) => b.thinking)
          .join('\n');
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        const assistantId = await db.messages.add({
          threadId,
          role: 'assistant',
          content: message.content || '',
          reasoning: reasoning, // Save reasoning content
          tool_calls: message.tool_calls,
          model: modelName,
          parentId: currentParentId,
          createdAt: new Date(),
        });
        currentParentId = assistantId;
        await db.threads.update(threadId, { activeLeafId: assistantId });

        for (const toolCall of message.tool_calls) {
          if (toolCall.type !== 'function') continue;
          let toolResult = '';
          try {
            const args = JSON.parse(toolCall.function.arguments);
            toolResult = await executeTool(toolCall.function.name, args);
          } catch (e) {
            toolResult = `Error: ${String(e)}`;
          }

          const toolId = await db.messages.add({
            threadId,
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
            parentId: currentParentId,
            createdAt: new Date(),
          });
          currentParentId = toolId;
          await db.threads.update(threadId, { activeLeafId: toolId });
        }
        continue;
      }

      const assistantMessage: Message = {
        threadId,
        role: 'assistant',
        content: message.content || '',
        reasoning: reasoning, // Save reasoning content
        parentId: currentParentId,
        usage: result.usage
          ? {
              promptTokens: result.usage.prompt_tokens,
              completionTokens: result.usage.completion_tokens,
              totalTokens: result.usage.total_tokens,
            }
          : undefined,
        model: modelName,
        createdAt: new Date(),
      };
      const finalId = await db.messages.add(assistantMessage);

      // AI応答から画像を抽出して保存
      if (message.content) {
        // Chat Completion の場合は message.content が文字列か parts の可能性がある
        const contentParts =
          typeof message.content === 'string'
            ? [{ type: 'text' as const, text: message.content }]
            : (message.content as ChatCompletionContentPart[]);
        await extractAndSaveImages(threadId, finalId, contentParts);
      }

      await db.threads.update(threadId, { activeLeafId: finalId });
      assistantMessage.id = finalId;
      return assistantMessage;
    } catch (error) {
      const errorMessage: Message = {
        threadId,
        role: 'assistant',
        content: `エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        parentId: currentParentId,
        model: 'system',
        createdAt: new Date(),
      };
      const errorId = await db.messages.add(errorMessage);
      await db.threads.update(threadId, { activeLeafId: errorId });
      errorMessage.id = errorId;
      // エラー時もメッセージとして返却することで、UI上での表示を確実にする
      return errorMessage;
    }
  }
}

async function* handleStreamResponse(
  threadId: number,
  modelId: string,
  modelName: string,
  parentId: number | null | undefined,
  stream: AsyncIterable<ChatCompletionChunk>,
): AsyncIterable<ChatCompletionChunk> {
  let fullContent = '';
  let fullReasoning = '';
  // biome-ignore lint/suspicious/noExplicitAny: Building partial tool calls requires flexible object
  const toolCallsMap: Record<number, any> = {};
  let isToolCall = false;
  let currentParentId = parentId;
  const accumulatedImages: ChatCompletionContentPart[] = [];

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    const deltaAny = choice.delta as ExtendedChatCompletionDelta;
    if (deltaAny.content) {
      if (typeof deltaAny.content === 'string') {
        fullContent += deltaAny.content;
      } else if (Array.isArray(deltaAny.content)) {
        // コンテンツパーツが配列で来る場合
        for (const part of deltaAny.content as (
          | string
          | { type: string; text?: string; image_url?: { url: string } }
        )[]) {
          if (typeof part === 'string') {
            fullContent += part;
          } else if (part.type === 'text' && part.text) {
            fullContent += part.text;
          } else if (part.type === 'image_url' && part.image_url) {
            console.log(
              'Image URL part found in delta array:',
              `${part.image_url.url.substring(0, 50)}...`,
            );
            accumulatedImages.push({ type: 'image_url', image_url: part.image_url });
          } else {
            console.log('Unknown content part in delta array:', part);
          }
        }
      }
    }

    // トップレベルのimage_url対応
    if (deltaAny.image_url) {
      console.log(
        'Top-level image_url found in delta:',
        `${deltaAny.image_url.url.substring(0, 50)}...`,
      );
      accumulatedImages.push({ type: 'image_url', image_url: deltaAny.image_url });
    }

    // images配列形式への対応 (LiteLLM等)
    if (deltaAny.images && Array.isArray(deltaAny.images)) {
      for (const img of deltaAny.images) {
        if (img.image_url) {
          console.log(
            'Image found in delta.images array:',
            `${img.image_url.url.substring(0, 50)}...`,
          );
          accumulatedImages.push({ type: 'image_url', image_url: img.image_url });
        }
      }
    }

    if (deltaAny.reasoning_content) {
      fullReasoning += deltaAny.reasoning_content;
    }

    if (choice.delta?.tool_calls) {
      isToolCall = true;
      for (const tc of choice.delta.tool_calls) {
        if (!toolCallsMap[tc.index]) {
          toolCallsMap[tc.index] = {
            id: tc.id || '',
            type: 'function',
            function: { name: '', arguments: '' },
          };
        }
        const target = toolCallsMap[tc.index];
        if (tc.id) target.id = tc.id;
        if (tc.function) {
          if (tc.function.name) target.function.name += tc.function.name;
          if (tc.function.arguments) target.function.arguments += tc.function.arguments;
        }
      }
    }
    yield chunk;
  }

  if (isToolCall) {
    const toolCalls = Object.values(toolCallsMap);
    const assistantId = await db.messages.add({
      threadId,
      role: 'assistant',
      content: fullContent,
      reasoning: fullReasoning,
      tool_calls: toolCalls,
      model: modelName,
      parentId: currentParentId,
      createdAt: new Date(),
    });
    currentParentId = assistantId;
    await db.threads.update(threadId, { activeLeafId: assistantId });

    // アシスタントメッセージに関連する画像を保存
    if (accumulatedImages.length > 0) {
      await extractAndSaveImages(threadId, assistantId, accumulatedImages);
    }

    for (const toolCall of toolCalls) {
      let toolResult = '';
      try {
        const args = JSON.parse(toolCall.function.arguments);
        toolResult = await executeTool(toolCall.function.name, args);
      } catch (e) {
        toolResult = `Error: ${String(e)}`;
      }
      const toolId = await db.messages.add({
        threadId,
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCall.id,
        parentId: currentParentId,
        createdAt: new Date(),
      });
      currentParentId = toolId;
      await db.threads.update(threadId, { activeLeafId: toolId });
    }

    const nextResponse = await sendMessage(threadId, '', modelId, {
      stream: true, // stream=trueの場合の処理のため、true固定
      parentId: currentParentId,
    });
    if (Symbol.asyncIterator in nextResponse) {
      const iterator = nextResponse as AsyncIterable<ChatCompletionChunk>;
      for await (const chunk of iterator) {
        yield chunk;
      }
    }
  } else {
    const finalId = await db.messages.add({
      threadId,
      role: 'assistant',
      content: fullContent,
      reasoning: fullReasoning,
      model: modelName,
      parentId: currentParentId,
      createdAt: new Date(),
    });

    // アシスタントメッセージに関連する画像を保存
    if (accumulatedImages.length > 0) {
      await extractAndSaveImages(threadId, finalId, accumulatedImages);
    }

    await db.threads.update(threadId, { activeLeafId: finalId });
  }
}

async function* handleResponseStream(
  threadId: number,
  modelId: string,
  modelName: string,
  parentId: number | null | undefined,
  stream: AsyncIterable<ResponseStreamEvent>,
  options: { onChunk?: (chunk: string) => void } = {},
): AsyncIterable<ChatCompletionChunk> {
  let fullContent = '';
  let reasoningSummary = '';
  const responseToolCalls: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[] = [];
  let outputItems: NonNullable<Response['output']> = [];
  let currentParentId = parentId;

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      const delta = (event as { delta?: string }).delta;
      if (delta) {
        fullContent += delta;
        if (options.onChunk) options.onChunk(delta);
        yield {
          id: '',
          choices: [{ delta: { content: delta }, finish_reason: null, index: 0 }],
          created: Date.now(),
          model: modelName,
          object: 'chat.completion.chunk',
        };
      }
    } else if (event.type === 'response.reasoning_text.delta') {
      const delta = (event as { delta?: string }).delta;
      if (delta) {
        reasoningSummary += delta;
        yield {
          id: '',
          // biome-ignore lint/suspicious/noExplicitAny: LiteLLM拡張考慮
          choices: [{ delta: { reasoning_content: delta } as any, finish_reason: null, index: 0 }],
          created: Date.now(),
          model: modelName,
          object: 'chat.completion.chunk',
        };
      }
    } else if (event.type === 'response.completed') {
      const response = (event as { response?: Response }).response;
      if (response?.output) {
        outputItems = response.output;
        for (const item of outputItems) {
          if (item.type === 'function_call') {
            responseToolCalls.push({
              id: item.id || `call_${Math.random().toString(36).slice(2, 11)}`,
              type: 'function' as const,
              function: {
                name: item.name || '',
                arguments: item.arguments || '{}',
              },
            });
          }
        }
      }
    }
  }

  if (responseToolCalls.length > 0) {
    const assistantId = await db.messages.add({
      threadId,
      role: 'assistant',
      content: fullContent || '',
      reasoningSummary: reasoningSummary,
      tool_calls: responseToolCalls,
      model: modelName,
      parentId: currentParentId,
      createdAt: new Date(),
    });
    currentParentId = assistantId;
    await db.threads.update(threadId, { activeLeafId: assistantId });

    for (const toolCall of responseToolCalls) {
      let toolResult = '';
      try {
        const args = JSON.parse(toolCall.function.arguments);
        toolResult = await executeTool(toolCall.function.name, args);
      } catch (e) {
        toolResult = `Error: ${String(e)}`;
      }

      const toolId = await db.messages.add({
        threadId,
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCall.id,
        parentId: currentParentId,
        createdAt: new Date(),
      });
      currentParentId = toolId;
      await db.threads.update(threadId, { activeLeafId: toolId });
    }

    const nextResponse = await sendMessage(threadId, '', modelId, {
      stream: true,
      parentId: currentParentId,
    });
    if (Symbol.asyncIterator in nextResponse) {
      const iterator = nextResponse as AsyncIterable<ChatCompletionChunk>;
      for await (const chunk of iterator) {
        yield chunk;
      }
    }
  } else {
    // Save Assistant Message (No tools)
    const assistantMessage: Message = {
      threadId,
      role: 'assistant',
      content: fullContent || '(No content)',
      reasoningSummary: reasoningSummary,
      parentId: currentParentId,
      model: modelName,
      createdAt: new Date(),
    };

    const finalId = await db.messages.add(assistantMessage);

    // AI応答から画像を抽出して保存
    await extractAndSaveImages(
      threadId,
      finalId,
      outputItems as unknown as Record<string, unknown>[],
    );

    await db.threads.update(threadId, { activeLeafId: finalId });
  }
}

/**
 * メッセージを再生成する
 * 1. 指定されたメッセージがアシスタントなら、その親（ユーザー）から再送
 * 2. 指定されたメッセージがユーザーなら、そこから直接再送
 */
export async function regenerateMessage(
  threadId: number,
  messageId: number,
  modelId: string,
  options: {
    onUserMessageSaved?: (messageId: number | null | undefined) => void;
    signal?: AbortSignal;
  } = {},
): Promise<Message | AsyncIterable<ChatCompletionChunk> | undefined> {
  const message = await db.messages.get(messageId);
  if (!message) return;

  const allModels = await listModels();
  const currentModel = allModels.find((m) => m.id === modelId);
  const shouldStream = currentModel?.enableStream ?? false;

  if (message.role === 'user') {
    // ユーザーメッセージ自身を起点にする
    return sendMessage(threadId, '', modelId, {
      stream: shouldStream,
      parentId: messageId,
      onUserMessageSaved: options.onUserMessageSaved,
      signal: options.signal,
    });
  }

  // AIメッセージの親（通常はユーザーメッセージ）を起点に再送
  return sendMessage(threadId, '', modelId, {
    stream: shouldStream,
    parentId: message.parentId ?? null,
    onUserMessageSaved: options.onUserMessageSaved,
    signal: options.signal,
  });
}

/**
 * ブランチを切り替える。指定されたメッセージの最新の子孫を自動的に見つける
 */
export async function switchBranch(threadId: number, messageId: number) {
  const allMessages = await db.messages.where('threadId').equals(threadId).toArray();

  // 子メッセージを辿って最新のメッセージ（リーフ）を見つける
  const findLatestLeaf = (currentId: number): number => {
    const children = allMessages
      .filter((m) => m.parentId === currentId)
      .sort((a, b) => (b.id || 0) - (a.id || 0));

    if (children.length === 0 || !children[0].id) return currentId;
    return findLatestLeaf(children[0].id);
  };

  const leafId = findLatestLeaf(messageId);
  await db.threads.update(threadId, { activeLeafId: leafId });
}

/**
 * メッセージとそのすべての末裔を削除する
 */
export async function deleteMessageAndDescendants(threadId: number, messageId: number) {
  const allMessages = await db.messages.where('threadId').equals(threadId).toArray();

  const getDescendantIds = (currentId: number): number[] => {
    const ids: number[] = [currentId];
    const children = allMessages.filter((m) => m.parentId === currentId);
    for (const child of children) {
      if (child.id) {
        ids.push(...getDescendantIds(child.id));
      }
    }
    return ids;
  };

  const idsToDelete = getDescendantIds(messageId);
  await db.transaction('rw', db.messages, db.threads, db.files, async () => {
    // 削除対象のメッセージに関連するファイルを削除
    await db.files.where('messageId').anyOf(idsToDelete).delete();
    // メッセージを削除
    await db.messages.bulkDelete(idsToDelete);

    // activeLeafId が削除対象の中に含まれている場合、親メッセージに巻き戻す
    const thread = await db.threads.get(threadId);
    if (thread?.activeLeafId && idsToDelete.includes(thread.activeLeafId)) {
      const message = allMessages.find((m) => m.id === messageId);
      await db.threads.update(threadId, { activeLeafId: message?.parentId ?? null });
    }
  });
}

/**
 * メッセージの内容を更新する
 */
export async function updateMessageContent(messageId: number, content: string) {
  return updateMessageWithFiles(messageId, content);
}

/**
 * メッセージの内容と添付ファイルを一括更新する
 */
export async function updateMessageWithFiles(
  messageId: number,
  content: string,
  removedFileIds: number[] = [],
  newFiles: File[] = [],
) {
  const message = await db.messages.get(messageId);
  if (!message) return;

  await db.transaction('rw', db.messages, db.files, async () => {
    // 1. 本文の更新
    await db.messages.update(messageId, { content });

    // 2. ファイルの削除
    if (removedFileIds.length > 0) {
      await db.files.where('id').anyOf(removedFileIds).delete();
    }

    // 3. 新しいファイルの保存
    if (newFiles.length > 0) {
      const { saveFile } = await import('./FileService');
      for (const file of newFiles) {
        await saveFile(file, file.name, {
          threadId: message.threadId,
          messageId: messageId,
        });
      }
    }
  });
}

/**
 * チャットのタイトルを自動生成する
 */
export async function generateTitle(
  threadId: number,
  providerId: string,
  modelId: string,
): Promise<void> {
  // 1. メッセージ履歴の取得（最初のユーザーメッセージとアシスタントメッセージ）
  const messages = await getActivePathMessages(threadId);
  // systemプロンプトを除外して、ユーザーとアシスタントのやり取りだけ抽出
  const conversation = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, 2);

  if (conversation.length === 0) return;

  // 2. プロバイダー情報の取得
  const provider = await db.providers.get(Number(providerId));
  if (!provider) {
    console.warn('Title generation failed: Provider not found');
    return;
  }

  // 3. プロンプトの構築
  const prompt: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content:
        'You are a helpful assistant that generates a short, concise title for a conversation. The title should be in the same language as the conversation (Japanese if the conversation is in Japanese). Return ONLY the title text, no quotes or extra words. Maximum 20 characters.',
    },
    ...conversation.map(
      (m) =>
        ({
          role: m.role === 'user' ? 'user' : 'assistant', // role validation
          content: m.content,
        }) as ChatCompletionMessageParam,
    ),
    {
      role: 'user',
      content: 'Generate a title for this conversation.',
    },
  ];

  try {
    // 4. LLM呼び出し
    const response = await chatCompletion({
      model: modelId,
      messages: prompt,
      provider: provider,
      stream: false,
      max_tokens: 50,
    });

    if (response && 'choices' in response && response.choices.length > 0) {
      let title = response.choices[0].message.content?.trim() || '';
      // 引用符がついている場合は削除
      title = title.replace(/^["'「]+|["'」]+$/g, '');

      if (title) {
        // 5. タイトル更新
        await db.threads.update(threadId, { title });
      }
    }
  } catch (error) {
    console.error('Title generation failed:', error);
    // 失敗時は何もしない（デフォルトのタイトルなどが維持される）
  }
}

/**
 * AI応答から画像を抽出して保存する
 */
async function extractAndSaveImages(
  threadId: number,
  messageId: number,
  content: (ChatCompletionContentPart | Record<string, unknown>)[],
) {
  if (!Array.isArray(content)) return;

  console.log(`Extracting images for message ${messageId}, content parts: ${content.length}`);

  for (const part of content) {
    let imageUrl: string | undefined;
    const fileName = `generated_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;

    // 型ガードを用いて各形式から安全に抽出
    // OpenAI / OpenRouter標準の image_url 形式
    if ('type' in part && part.type === 'image_url' && 'image_url' in part) {
      const openAiPart = part as { image_url: { url: string } };
      if (openAiPart.image_url?.url) {
        imageUrl = openAiPart.image_url.url;
      }
    }
    // Anthropic標準の image/source 形式
    else if ('type' in part && part.type === 'image' && 'source' in part) {
      const anthropicPart = part as { source: { data: string; media_type: string } };
      if (anthropicPart.source?.data && anthropicPart.source?.media_type) {
        imageUrl = `data:${anthropicPart.source.media_type};base64,${anthropicPart.source.data}`;
      }
    }
    // Response API 等の特殊形式 (image_url プロパティが直接ある場合)
    else if ('image_url' in part && part.image_url) {
      const directPart = part as { image_url: string | { url: string } };
      imageUrl =
        typeof directPart.image_url === 'string' ? directPart.image_url : directPart.image_url.url;
    }
    // テキストパーツ内の Markdown 画像記法から Data URL を抽出
    else if (
      'type' in part &&
      part.type === 'text' &&
      'text' in part &&
      typeof part.text === 'string'
    ) {
      const text = part.text;
      const dataUrlRegex = /!\[.*?\]\((data:image\/[a-zA-Z+-]+;base64,[a-zA-Z0-9+/=]+)\)/g;
      let match: RegExpExecArray | null;
      while (true) {
        match = dataUrlRegex.exec(text);
        if (match === null) break;
        await saveBase64Image(threadId, messageId, match[1], fileName);
      }
      continue;
    }

    if (imageUrl) {
      if (imageUrl.startsWith('data:')) {
        await saveBase64Image(threadId, messageId, imageUrl, fileName);
      } else {
        console.warn(
          'External image URL (not data:) detected. Auto-saving is not supported for external URLs yet.',
          imageUrl.substring(0, 50),
        );
      }
    }
  }
}

/**
 * Base64形式の画像をDBに保存する内部ヘルパー
 */
async function saveBase64Image(
  threadId: number,
  messageId: number,
  dataUrl: string,
  fileName: string,
) {
  try {
    const { saveFile } = await import('./FileService');
    console.log(`Saving assistant image from data URL (length: ${dataUrl.length})...`);
    const blob = dataURLToBlob(dataUrl);
    const fileId = await saveFile(blob, fileName, {
      threadId,
      messageId,
      isGenerated: true,
    });
    console.log(`Assistant image successfully saved with ID: ${fileId}`);
    return fileId;
  } catch (e) {
    console.error('Failed to save assistant image:', e);
  }
}
