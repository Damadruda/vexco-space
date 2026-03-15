const RAINDROP_BASE = "https://api.raindrop.io/rest/v1";

export interface RaindropBookmark {
  id: number;
  title: string;
  excerpt: string;
  link: string;
  tags: string[];
  created: string;
  collection: { title: string };
}

export interface RaindropCollection {
  id: number;
  title: string;
  count: number;
}

interface RaindropGetOptions {
  collectionId?: number;
  page?: number;
  perPage?: number;
  search?: string;
}

async function raindropFetch<T>(
  path: string,
  token: string
): Promise<T> {
  const res = await fetch(`${RAINDROP_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401) {
    throw new Error("Token de Raindrop inválido o expirado");
  }

  if (!res.ok) {
    throw new Error(`Raindrop API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export const raindropClient = {
  async getBookmarks(
    token: string,
    options: RaindropGetOptions = {}
  ): Promise<{ items: RaindropBookmark[]; count: number }> {
    const { collectionId = 0, page = 0, perPage = 50, search } = options;

    const params = new URLSearchParams({
      page: String(page),
      perpage: String(Math.min(perPage, 50)),
    });
    if (search) params.set("search", search);

    const data = await raindropFetch<{
      result: boolean;
      items: RaindropBookmark[];
      count: number;
    }>(`/raindrops/${collectionId}?${params}`, token);

    return { items: data.items ?? [], count: data.count ?? 0 };
  },

  async getCollections(
    token: string
  ): Promise<RaindropCollection[]> {
    const data = await raindropFetch<{
      result: boolean;
      items: RaindropCollection[];
    }>("/collections", token);

    return data.items ?? [];
  },
};
