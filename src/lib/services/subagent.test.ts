import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ModelService from './ModelService';
import * as ToolService from './ToolService';

vi.mock('./ModelService', () => ({
  chatCompletion: vi.fn(),
  listModels: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      enabledTools: {},
      enabledBuiltInTools: {},
    }),
  },
}));

vi.mock('./McpService', () => ({
  getAllMcpTools: vi.fn().mockResolvedValue([]),
  executeMcpToolWithMetadata: vi.fn(),
}));

describe('subagent tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('サブエージェントツールが正しく呼び出され、ModelServiceにパラメーターが渡されること', async () => {
    const mockResponse = {
      choices: [{ message: { role: 'assistant', content: 'サブエージェントの回答です' } }],
    };
    // biome-ignore lint/suspicious/noExplicitAny: mock response type is simplified for testing
    vi.spyOn(ModelService, 'chatCompletion').mockResolvedValue(mockResponse as any);

    const context = { threadId: 1, modelId: 'test-model' };
    const args = { input: 'こんにちは', systemPrompt: 'あなたは親切な助手です' };

    const result = await ToolService.executeToolWithMetadata('subagent', args, context);

    const calls = vi.mocked(ModelService.chatCompletion).mock.calls;
    console.log('Total calls:', calls.length);
    if (calls.length > 0) {
      console.log('Call 0 Model:', calls[0][0].model);
      console.log('Call 0 Messages:', JSON.stringify(calls[0][0].messages, null, 2));
    }

    expect(ModelService.chatCompletion).toHaveBeenCalled();
    const firstCall = vi.mocked(ModelService.chatCompletion).mock.calls[0][0];
    expect(firstCall.model).toBe('test-model');
    expect(firstCall.messages).toContainEqual({
      role: 'system',
      content: 'あなたは親切な助手です',
    });
    expect(firstCall.messages).toContainEqual({ role: 'user', content: 'こんにちは' });
    expect(result.content).toBe('サブエージェントの回答です');
  });

  it('ReActループ: ツール呼び出しが発生した場合、複数回実行されること', async () => {
    const mockToolCall = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"test"}' },
              },
            ],
          },
        },
      ],
    };
    const mockFinalResponse = {
      choices: [{ message: { role: 'assistant', content: '検索結果に基づいた回答です' } }],
    };

    vi.spyOn(ModelService, 'chatCompletion')
      // biome-ignore lint/suspicious/noExplicitAny: mock response type is simplified for testing
      .mockResolvedValueOnce(mockToolCall as any)
      // biome-ignore lint/suspicious/noExplicitAny: mock response type is simplified for testing
      .mockResolvedValueOnce(mockFinalResponse as any);

    const context = { threadId: 1, modelId: 'test-model' };
    const args = { input: '検索して' };

    const result = await ToolService.executeToolWithMetadata('subagent', args, context);

    expect(ModelService.chatCompletion).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('検索結果に基づいた回答です');
  });
});
