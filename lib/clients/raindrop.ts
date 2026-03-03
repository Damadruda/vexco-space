export const RAINDROP_BASE_URL = 'https://api.raindrop.io/rest/v1'

interface RaindropBookmark {
  _id: number
  title: string
  excerpt: string
  link: string
  created: string
  lastUpdate: string
  tags: string[]
  collection: {
    $id: number
  }
  cover?: string
  domain?: string
}

interface RaindropResponse {
  result: boolean
  items: RaindropBookmark[]
  count: number
  collectionId?: number
}

export async function fetchRaindropBookmarks(
  token: string,
  options: {
    collectionId?: number
    page?: number
    perPage?: number
    search?: string
    lastSyncAt?: Date
  } = {}
): Promise<RaindropBookmark[]> {
  const { collectionId = 0, page = 0, perPage = 25, search, lastSyncAt } = options

  const params = new URLSearchParams({
    page: page.toString(),
    perpage: perPage.toString(),
    ...(search && { search }),
  })

  const url = collectionId
    ? `${RAINDROP_BASE_URL}/raindrops/${collectionId}?${params}`
    : `${RAINDROP_BASE_URL}/raindrops/0?${params}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    next: { revalidate: 0 },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Raindrop API error: ${response.status} - ${error}`)
  }

  const data: RaindropResponse = await response.json()

  if (!data.result) {
    throw new Error('Raindrop API returned result: false')
  }

  // Filter by lastSyncAt if provided
  if (lastSyncAt) {
    return data.items.filter(item => new Date(item.lastUpdate) > lastSyncAt)
  }

  return data.items
}

export async function fetchAllRaindropBookmarks(
  token: string,
  options: { collectionId?: number; lastSyncAt?: Date } = {}
): Promise<RaindropBookmark[]> {
  const allBookmarks: RaindropBookmark[] = []
  let page = 0
  const perPage = 50

  while (true) {
    const items = await fetchRaindropBookmarks(token, {
      ...options,
      page,
      perPage,
    })

    allBookmarks.push(...items)

    if (items.length < perPage) break
    page++

    // Rate limiting: small delay between pages
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  return allBookmarks
}

export function mapRaindropToInboxItem(bookmark: RaindropBookmark, userId: string) {
  return {
    type: 'link' as const,
    rawContent: bookmark.excerpt || bookmark.title,
    sourceUrl: bookmark.link,
    sourceTitle: bookmark.title,
    status: 'pending' as const,
    tags: bookmark.tags || [],
    userId,
  }
}
