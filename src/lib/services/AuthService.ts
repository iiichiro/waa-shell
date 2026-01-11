import { db } from '../db';

/**
 * OIDC認証およびトークン管理を行うサービス
 */
export async function loginWithOidc(serverId: number): Promise<string> {
  const server = await db.mcpServers.get(serverId);
  if (!server || !server.oidcConfig) {
    throw new Error('OIDC configuration not found for this server.');
  }

  const { issuer, clientId, scopes = ['openid', 'profile', 'email'] } = server.oidcConfig;

  // 1. OIDC Discovery
  const discoveryResponse = await fetch(`${issuer}/.well-known/openid-configuration`);
  const discoveryData = await discoveryResponse.json();
  const authorizationEndpoint = discoveryData.authorization_endpoint;

  // 2. PKCE 用の Code Verifier と Challenge の生成 (簡易的な実装)
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // 一時的な状態（state）を生成
  const state = generateRandomString(16);

  // 3. 認証 URL の構築
  const redirectUri = 'aichat://auth/callback';
  const authUrl = new URL(authorizationEndpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // TODO: Tauri のシェルまたはウィンドウを開いてログインを実行
  console.log('Opening auth window:', authUrl.toString());

  // 仮の実装: ここでは何らかの方法で code を受け取る必要がある
  // 実装上は deep link ハンドラが code を受け取り、AuthService の callback を呼ぶ形になる

  return 'auth_url_opened';
}

/**
 * 補助関数: ランダムな文字列の生成
 */
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}

/**
 * 補助関数: PKCE Code Challenge (SHA256 Base64Url)
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return base64;
}

/**
 * 保存されたトークンの取得（APIキーと同様のセキュリティを想定）
 */
export async function getAccessToken(serverId: number): Promise<string | undefined> {
  const server = await db.mcpServers.get(serverId);
  return server?.oidcConfig?.token;
}
