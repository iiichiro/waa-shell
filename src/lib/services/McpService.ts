import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { db } from '../db';
import { getAccessToken } from './AuthService';

// サーバIDごとのクライアントインスタンスを保持
const clients = new Map<number, Client>();

/**
 * 有効な全 MCP サーバからツールを取得する
 */
export async function getAllMcpTools(): Promise<Tool[]> {
  const servers = await db.mcpServers.where('isActive').equals(1).toArray();
  const allTools: Tool[] = [];

  for (const server of servers) {
    if (!server.id) continue;
    try {
      const client = await ensureConnected(server.id);
      const { tools } = await client.listTools();

      // ツール名にサーバ名を付加して衝突を避ける
      const prefixedTools = tools.map((t) => ({
        ...t,
        name: `${server.name}__${t.name}`,
      }));
      allTools.push(...prefixedTools);
    } catch (e) {
      console.error(`Failed to get tools from MCP server ${server.name}:`, e);
    }
  }

  return allTools;
}

/**
 * MCP ツールの実行
 */
export async function executeMcpTool(
  serverName: string,
  toolName: string,
  args: unknown,
): Promise<string> {
  const server = await db.mcpServers.where('name').equals(serverName).first();
  if (!server || !server.id) throw new Error(`MCP Server ${serverName} not found.`);

  const client = await ensureConnected(server.id);
  const result = await client.callTool({
    name: toolName,
    arguments: args as Record<string, unknown>,
  });

  return JSON.stringify(result.content);
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

  // トランスポートの作成 (Streamable HTTP)
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers },
  });

  const client = new Client(
    {
      name: 'waa-shell-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    },
  );

  await client.connect(transport);
  clients.set(serverId, client);

  return client;
}

/**
 * サーバー接続を切断し、キャッシュから削除する
 * 設定変更時などに使用
 */
export async function disconnectServer(serverId: number) {
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
