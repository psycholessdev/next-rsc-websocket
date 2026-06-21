// src/worker.ts
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope

const swStatuses = new Map<string, boolean>()
const pendingSwRequests = new Map<string, (response: Response) => void>()

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

// Intercept fetch requests
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  const isRscRequest = url.searchParams.has('_rsc') || event.request.headers.get('RSC') === '1'

  if (isRscRequest) {
    event.respondWith(
      new Promise<Response>(async resolve => {
        // Get the specific window/tab client that made the request
        const client = await self.clients.get(event.clientId)
        const requestId = crypto.randomUUID()

        // Save the resolver function mapping to the unique dynamic ID
        pendingSwRequests.set(requestId, resolve)

        // Extract body text if it's a POST request (e.g. Server Actions)
        let body: string | null = null
        if (['POST', 'PUT', 'PATCH'].includes(event.request.method)) {
          body = await event.request.text()
        }

        // Extract headers into a plain object
        const headers: Record<string, string> = {}
        event.request.headers.forEach((value, key) => {
          headers[key] = value
        })

        if (client && swStatuses.get(client.id)) {
          client.postMessage({
            type: 'RSC_FETCH_INTERCEPTED',
            id: requestId,
            url: event.request.url,
            method: event.request.method,
            headers,
            body,
          })
        } else {
          // Fallback if client window context isn't fully ready/found
          console.error(`[next-rsc-websocket] proxy failed for ${url}`)
          fetch(event.request).then(resolve)
        }
      }),
    )
  }
})

// Listen for replies back from the Main Thread WebSocket client
self.addEventListener('message', event => {
  const { type, id, status, headers, body } = event.data
  const source = event.source

  if (type === 'GET_AVAILABILITY' && source instanceof Client && source.type === 'window') {
    console.log(`[next-rsc-websocket] GET_AVAILABILITY: id: ${id} , status: ${status}`)
    swStatuses.set(source.id, status)
  }

  if (type === 'RSC_RESPONSE_DATA' && pendingSwRequests.has(id)) {
    const resolve = pendingSwRequests.get(id)
    if (resolve) {
      const response = new Response(body, {
        status: status,
        headers: new Headers({
          ...headers,
          'Content-Type': 'text/x-component; charset=utf-8', // Standard RSC format content-type
        }),
      })
      resolve(response)
      pendingSwRequests.delete(id)
      console.log(`[next-rsc-websocket] proxied ${id}`)
    }
  }
})
