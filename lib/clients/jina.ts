const JINA_BASE = "https://r.jina.ai";
const MAX_CONTENT_LENGTH = 30_000;
const TIMEOUT_MS = 15_000;

export interface JinaContent {
  title: string;
  description: string;
  content: string; // markdown
  url: string;
}

export const jinaClient = {
  async extractContent(url: string, apiKey?: string): Promise<JinaContent> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Return-Format": "markdown",
      };

      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const res = await fetch(`${JINA_BASE}/${url}`, {
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Jina Reader error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json() as {
        code: number;
        status: number;
        data: {
          title?: string;
          description?: string;
          content?: string;
          url?: string;
        };
      };

      const extracted = data.data ?? {};

      return {
        title: extracted.title ?? "",
        description: extracted.description ?? "",
        content: (extracted.content ?? "").slice(0, MAX_CONTENT_LENGTH),
        url: extracted.url ?? url,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Jina Reader timeout después de ${TIMEOUT_MS / 1000}s para: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  },
};
