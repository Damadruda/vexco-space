export const JINA_BASE_URL = 'https://r.jina.ai'
export const JINA_SEARCH_URL = 'https://s.jina.ai'

interface JinaReaderResponse {
  code: number
  status: number
  data: {
    title: string
    description: string
    url: string
    content: string
    usage: {
      tokens: number
    }
  }
}

export async function extractContentWithJina(
  url: string,
  apiKey?: string
): Promise<{
  title: string
  description: string
  content: string
  url: string
  tokenCount: number
}> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Return-Format': 'markdown',
    'X-Timeout': '30',
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const readerUrl = `${JINA_BASE_URL}/${encodeURIComponent(url)}`

  const response = await fetch(readerUrl, {
    headers,
    signal: AbortSignal.timeout(35000),
  })

  if (!response.ok) {
    throw new Error(`Jina Reader error: ${response.status} for URL: ${url}`)
  }

  const data: JinaReaderResponse = await response.json()

  if (data.code !== 200) {
    throw new Error(`Jina Reader returned code ${data.code}`)
  }

  return {
    title: data.data.title || '',
    description: data.data.description || '',
    content: data.data.content || '',
    url: data.data.url || url,
    tokenCount: data.data.usage?.tokens || 0,
  }
}

export async function extractContentBatch(
  urls: string[],
  apiKey?: string,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<Array<{ url: string; success: boolean; data?: Awaited<ReturnType<typeof extractContentWithJina>>; error?: string }>> {
  const { concurrency = 3, delayMs = 500 } = options
  const results = []

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)

    const batchResults = await Promise.allSettled(
      batch.map(url => extractContentWithJina(url, apiKey))
    )

    for (let j = 0; j < batch.length; j++) {
      const result = batchResults[j]
      if (result.status === 'fulfilled') {
        results.push({ url: batch[j], success: true, data: result.value })
      } else {
        results.push({
          url: batch[j],
          success: false,
          error: result.reason?.message || 'Unknown error',
        })
      }
    }

    if (i + concurrency < urls.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return results
}
