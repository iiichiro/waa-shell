import { fetch } from '@tauri-apps/plugin-http';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Tauri環境かどうかを判定する
 */
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isTauri = () =>
  typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

/**
 * DuckDuckGo HTML版を使用してWeb検索を行う
 * @param query 検索クエリ
 * @returns 検索結果のリスト
 */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  try {
    // DuckDuckGo HTML版にリクエスト
    // 注意: User-Agentを設定しないと403になることがあるため、一般的なブラウザのUAを設定
    const response = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: `q=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      throw new Error(`Search failed with status: ${response.status}`);
    }

    const html = await response.text();

    // HTMLのパース
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const results: SearchResult[] = [];
    const resultElements = doc.querySelectorAll('.result');

    resultElements.forEach((element) => {
      const titleLink = element.querySelector('.result__a');
      const snippetElement = element.querySelector('.result__snippet');

      if (titleLink && snippetElement) {
        const title = titleLink.textContent?.trim() || '';
        const url = titleLink.getAttribute('href') || '';
        const snippet = snippetElement.textContent?.trim() || '';

        if (title && url && snippet) {
          results.push({
            title,
            url,
            // DuckDuckGoのURLはプロキシ経由の場合があるが、HTML版は直接リンクになっていることが多い
            // 必要であればURLデコード処理を追加
            snippet,
          });
        }
      }
    });

    return results.slice(0, 5); // 上位5件を返す
  } catch (error) {
    console.error('Web search error:', error);
    // エラー時は空配列を返すか、エラーを投げるか。ここではエラーメッセージを含む結果を返す
    throw error;
  }
}
