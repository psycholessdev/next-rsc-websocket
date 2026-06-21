// src/client.ts
export interface ClientConfig {
  wsUrl: string
}

export class RscWebSocketClient {
  private ws!: WebSocket
  private swRegistration: ServiceWorkerRegistration | null = null
  private config: ClientConfig
  private pendingRequests = new Map<string, (data: any) => void>()

  constructor(config: ClientConfig) {
    this.config = config
  }

  async init() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }
    if (!this.config.wsUrl) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      this.config.wsUrl = `${protocol}//${window.location.host}/_next/rsc-ws`
    }

    // 1. Register the injected service worker route
    this.swRegistration = await navigator.serviceWorker.register('/next-rsc-worker.js', {
      scope: '/',
    })

    // 2. Setup WebSocket connection
    this.initWebSocket()

    // 3. Listen to messages coming from the Service Worker interceptor
    navigator.serviceWorker.addEventListener('message', async event => {
      const { type, id, url, headers, method, body } = event.data

      if (type === 'GET_AVAILABILITY') {
        this.swRegistration?.active?.postMessage({
          type: 'GET_AVAILABILITY',
          status: this.ws.readyState === 1,
        })
      }

      if (type === 'RSC_FETCH_INTERCEPTED') {
        // Forward the HTTP request payloads across the WebSocket channel
        this.ws.send(
          JSON.stringify({
            type: 'RSC_REQUEST',
            id,
            url,
            method,
            headers,
            body,
          }),
        )

        // Keep track of how to respond back to the SW when WS replies
        this.pendingRequests.set(id, responsePayload => {
          this.swRegistration?.active?.postMessage({
            type: 'RSC_RESPONSE_DATA',
            id,
            status: responsePayload.status || 200,
            headers: responsePayload.headers || {},
            body: responsePayload.body,
          })
        })
      }
    })
  }

  private initWebSocket() {
    this.ws = new WebSocket(this.config.wsUrl)

    this.ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'RSC_RESPONSE' && this.pendingRequests.has(message.id)) {
          const resolve = this.pendingRequests.get(message.id)
          if (resolve) {
            resolve(message)
            this.pendingRequests.delete(message.id)
          }
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err)
      }
    }

    this.ws.onopen = () => {
      this.ws.send(
        JSON.stringify({
          type: 'REGISTER_CLIENT',
          id: 'WINDOW_CLIENT_ID',
        }),
      )
      this.swRegistration?.active?.postMessage({
        type: 'GET_AVAILABILITY',
        status: true,
      })
    }

    this.ws.onclose = () => {
      this.swRegistration?.active?.postMessage({
        type: 'GET_AVAILABILITY',
        status: false,
      })

      // Reconnection logic here
      setTimeout(() => this.initWebSocket(), 3000)
    }
  }
}
