import type { McpAppUiData } from '../db';

/**
 * MCP App UIリソースを取得する
 * ui://スキームのリソースURIからHTMLコンテンツを取得する
 *
 * @param mcpAppUi - MCP Apps UIのメタデータ
 * @returns HTMLコンテンツ（取得失敗時はnull）
 */
export async function fetchMcpAppResource(mcpAppUi: McpAppUiData): Promise<string | null> {
  const { resourceUri } = mcpAppUi;

  // ui://スキームで始まるか確認
  if (!resourceUri.startsWith('ui://')) {
    console.error(`Invalid resource URI scheme: ${resourceUri}`);
    return null;
  }

  // resourceUriからパス部分を抽出（ui://server/path/to/resource → /path/to/resource）
  const uriWithoutScheme = resourceUri.slice(5); // 'ui://'.length === 5
  const firstSlashIndex = uriWithoutScheme.indexOf('/');

  if (firstSlashIndex === -1) {
    console.error(`Invalid resource URI format: ${resourceUri}`);
    return null;
  }

  // サーバー名とパスを抽出
  const serverName = uriWithoutScheme.slice(0, firstSlashIndex);
  const resourcePath = uriWithoutScheme.slice(firstSlashIndex + 1);

  // サーバー名からserverIdを取得
  const serverId = await getServerIdByName(serverName);
  if (serverId === null) {
    console.error(`MCP Server not found: ${serverName}`);
    return null;
  }

  try {
    // MCPサーバーからリソースを取得
    // Note: 現在のMCP SDKではresourceの取得方法が標準化されていないため、
    // HTTPエンドポイントに直接アクセスする方法を使用
    const html = await fetchResourceFromServer(serverId, resourcePath);
    return html;
  } catch (error) {
    console.error(`Failed to fetch MCP App resource from ${resourceUri}:`, error);
    return null;
  }
}

/**
 * MCPサーバーからリソースをHTTP経由で取得する
 */
async function fetchResourceFromServer(
  serverId: number,
  resourcePath: string,
): Promise<string | null> {
  // 遅延インポートで循環参照を回避
  const { db } = await import('../db');
  const { getAccessToken } = await import('./AuthService');

  const server = await db.mcpServers.get(serverId);
  if (!server || !server.url) {
    throw new Error(`MCP Server ${serverId} not found or URL is missing`);
  }

  // サーバーのベースURLを構築
  const baseUrl = server.url.endsWith('/') ? server.url.slice(0, -1) : server.url;
  const resourceUrl = `${baseUrl}/resources/${resourcePath}`;

  // ヘッダーを構築
  const headers: Record<string, string> = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  // OIDC認証が必要な場合はトークンを追加
  if (server.authType === 'oidc') {
    const token = await getAccessToken(serverId);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(resourceUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return html;
  } catch (error) {
    console.error(`Failed to fetch resource from ${resourceUrl}:`, error);
    throw error;
  }
}

/**
 * MCPサーバー名からserverIdを取得する（McpService用）
 * この関数はMcpServiceから直接serverIdを取得できるように公開する
 *
 * @param serverName - サーバー名
 * @returns serverId（見つからない場合はnull）
 */
export async function getServerIdByName(serverName: string): Promise<number | null> {
  const { db } = await import('../db');
  const server = await db.mcpServers.where('name').equals(serverName).first();
  return server?.id ?? null;
}
