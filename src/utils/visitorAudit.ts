const RPC_ENDPOINT = '/api/rpc2'
const DUPLICATE_WINDOW_MS = 1000

let requestId = 0
let lastPageKey = ''
let lastPageAt = 0

export async function recordVisitorPageView(path: string, route: string): Promise<void> {
  const normalizedPath = path.startsWith('/') ? path : '/'
  const normalizedRoute = route.slice(0, 128)
  const pageKey = `${normalizedPath}:${normalizedRoute}`
  const now = Date.now()
  if (pageKey === lastPageKey && now - lastPageAt < DUPLICATE_WINDOW_MS)
    return

  lastPageKey = pageKey
  lastPageAt = now

  try {
    await fetch(RPC_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `visitor-${++requestId}`,
        method: 'public:recordVisitorEvent',
        params: {
          event: 'page_view',
          path: normalizedPath,
          route: normalizedRoute,
        },
      }),
    })
  }
  catch {
    // Visitor logging must never block or degrade public navigation.
  }
}
