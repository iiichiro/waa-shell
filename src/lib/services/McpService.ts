import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { db, type McpAppUiData, type McpServer } from '../db';
import { getAccessToken } from './AuthService';

// サーバIDごとのクライアントインスタンスを保持
const clients = new Map<number, Client>();
// サーバIDごとの接続ステータスを保持
const serverStatuses = new Map<number, 'success' | 'error' | 'none'>();

/**
 * MCPツール実行結果
 */
export interface McpToolExecutionResult {
  content: string; // ツール実行結果のテキスト内容
  mcpAppUi?: McpAppUiData; // MCP Apps UIのメタデータ（存在する場合）
}

/**
 * ツール実行結果から_meta.uiメタデータを抽出する
 */
function extractMcpAppUiMetadata(result: unknown): McpAppUiData | undefined {
  if (!result || typeof result !== 'object') return undefined;

  // biome-ignore lint/suspicious/noExplicitAny: MCP result structure varies
  const resultObj = result as Record<string, any>;
  const meta = resultObj._meta;
  if (!meta || typeof meta !== 'object') return undefined;

  const ui = meta.ui;
  if (!ui || typeof ui !== 'object') return undefined;

  const resourceUri = ui.resourceUri;
  if (!resourceUri || typeof resourceUri !== 'string') return undefined;

  // resourceUriがui://スキームで始まるか確認
  if (!resourceUri.startsWith('ui://')) return undefined;

  return {
    resourceUri,
    permissions: Array.isArray(ui.permissions) ? ui.permissions : undefined,
    csp:
      ui.csp && typeof ui.csp === 'object'
        ? {
            allowedOrigins: Array.isArray(ui.csp.allowedOrigins)
              ? ui.csp.allowedOrigins
              : undefined,
          }
        : undefined,
  };
}

/**
 * サーバの現在の接続状態を確認する
 */
export async function getServerStatus(serverId: number): Promise<'success' | 'error' | 'none'> {
  const server = await db.mcpServers.get(serverId);
  if (!server || !server.isActive) {
    serverStatuses.delete(serverId);
    return 'none';
  }

  try {
    const client = await ensureConnected(serverId);
    await client.listTools();
    serverStatuses.set(serverId, 'success');
    return 'success';
  } catch (e) {
    console.error(`Failed to get status for server ${serverId}:`, e);
    serverStatuses.set(serverId, 'error');
    return 'error';
  }
}

/**
 * 現在保持しているすべてのサーバの接続ステータスを取得する
 */
export function getAllServerStatuses(): Record<number, 'success' | 'error' | 'none'> {
  const statuses: Record<number, 'success' | 'error' | 'none'> = {};
  for (const [id, status] of serverStatuses) {
    statuses[id] = status;
  }
  return statuses;
}

/**
 * サーバの接続テストを行う（DB保存済みのデータを使用）
 */
export async function pingServer(serverId: number): Promise<void> {
  const server = await db.mcpServers.get(serverId);
  if (!server) throw new Error(`Server ID ${serverId} not found.`);
  await testMcpConfig(server);
}

/**
 * 任意の設定で MCP サーバの接続テストを行う
 */
export async function testMcpConfig(
  config: Omit<McpServer, 'createdAt' | 'updatedAt'>,
): Promise<void> {
  if (!config.url) throw new Error('URL is required.');

  // テスト用の一時的なトランスポート作成
  const headers: Record<string, string> = {};
  // OIDC の場合は ID が必要（Service内の getAccessToken が ID 依存のため）
  // もし新規作成中（IDなし）で OIDC の場合は、ここでは簡易的にエラーにするか、
  // あるいは ID がある場合のみトークンを取得する
  if (config.authType === 'oidc' && 'id' in config && config.id) {
    const token = await getAccessToken(config.id as number);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let transport = null;
  if (config.type === undefined || config.type === 'streamableHttp') {
    transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers },
    });
  } else if (config.type === 'sse') {
    transport = new SSEClientTransport(new URL(config.url), {
      requestInit: { headers },
    });
  } else {
    throw new Error(`Unsupported server type: ${config.type}`);
  }

  const client = new Client(
    { name: 'waa-shell-test-client', version: '1.0.0' },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    await client.listTools();
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}

/**
 * 有効な全 MCP サーバからツールを取得する
 */
export async function getAllMcpTools(): Promise<Tool[]> {
  const allServers = await db.mcpServers.toArray();
  const servers = allServers.filter((s) => s.isActive);
  const allTools: Tool[] = [];

  for (const server of servers) {
    if (!server.id) continue;
    try {
      const tools = await getMcpToolsByServerId(server.id);
      allTools.push(...tools);
    } catch (e) {
      console.error(`Failed to get tools from MCP server ${server.name}:`, e);
    }
  }

  return allTools;
}

/**
 * 指定したサーバ ID の MCP サーバからツールを取得する
 * ツール名にはサーバ名のプレフィックスが付与される
 */
export async function getMcpToolsByServerId(serverId: number): Promise<Tool[]> {
  const server = await db.mcpServers.get(serverId);
  if (!server) throw new Error(`Server ID ${serverId} not found.`);

  if (!server.id) throw new Error(`Server ID for ${server.name} is missing.`);

  const client = await ensureConnected(server.id);
  const { tools } = await client.listTools();

  // ツール名にサーバ名を付加して衝突を避ける
  return tools.map((t) => ({
    ...t,
    name: `${server.name}__${t.name}`,
  }));
}

/**
 * MCP ツールの実行（UIメタデータ付き）
 */
export async function executeMcpToolWithMetadata(
  serverName: string,
  toolName: string,
  args: unknown,
): Promise<McpToolExecutionResult> {
  const server = await db.mcpServers.where('name').equals(serverName).first();
  if (!server || !server.id) throw new Error(`MCP Server ${serverName} not found.`);

  const client = await ensureConnected(server.id);
  const result = await client.callTool({
    name: toolName,
    arguments: args as Record<string, unknown>,
  });

  // _meta.uiメタデータを抽出
  const mcpAppUi = extractMcpAppUiMetadata(result);

  return {
    content: JSON.stringify(result.content),
    mcpAppUi,
  };
}

/**
 * MCP ツールの実行（後方互換性のため文字列を返すラッパー）
 */
export async function executeMcpTool(
  serverName: string,
  toolName: string,
  args: unknown,
): Promise<string> {
  const result = await executeMcpToolWithMetadata(serverName, toolName, args);
  return result.content;
}

/**
 * サーバへの接続を確立・維持する
 */
async function ensureConnected(serverId: number): Promise<Client> {
  const existingClient = clients.get(serverId);
  if (existingClient) {
    return existingClient;
  }

  const server = await db.mcpServers.get(serverId);
  if (!server) throw new Error(`Server ID ${serverId} not found.`);

  if (!server.url) throw new Error(`URL is required for MCP server ${server.name}.`);

  // OIDC トークンの取得
  const headers: Record<string, string> = {};
  if (server.authType === 'oidc') {
    const token = await getAccessToken(serverId);
    if (!token) {
      throw new Error(`Authentication required for server ${server.name}.`);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  // トランスポートの作成
  let transport = null;
  if (server.type === undefined || server.type === 'streamableHttp') {
    transport = new StreamableHTTPClientTransport(new URL(server.url), {
      requestInit: { headers },
    });
  } else if (server.type === 'sse') {
    // TODO: 後方互換性のために、SSEをサポート
    transport = new SSEClientTransport(new URL(server.url), {
      requestInit: { headers },
    });
  } else {
    throw new Error(`Unsupported server type: ${server.type}`);
  }

  const client = new Client(
    {
      name: 'waa-shell-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );

  try {
    await client.connect(transport);
    clients.set(serverId, client);
    serverStatuses.set(serverId, 'success');

    return client;
  } catch (e) {
    serverStatuses.set(serverId, 'error');
    throw e;
  }
}

/**
 * サーバ接続を切断し、キャッシュから削除する
 * 設定変更時などに使用
 */
export async function disconnectServer(serverId: number) {
  serverStatuses.delete(serverId);
  const client = clients.get(serverId);
  if (client) {
    try {
      await client.close();
    } catch (e) {
      console.error(`Failed to close MCP client for server ${serverId}:`, e);
    }
    clients.delete(serverId);
  }
}
