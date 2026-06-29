// src/client.ts
declare global {
  var wsPort: number | undefined
}

export interface ClientConfig {
  wsUrl: string
}

export class RscWebSocketClient {
  private ws!: WebSocket
  private swRegistration: ServiceWorkerRegistration | null = null
  private config: ClientConfig
  private pendingRequests = new Map<string, (data: any) => void>()
  private clientId!: string

  constructor(config: ClientConfig) {
    this.config = config
    this.clientId = crypto.randomUUID()
  }

  async init() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }
    if (!this.config.wsUrl) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      this.config.wsUrl = `${protocol}//${window.location.host}/_next/rsc-ws`
    }

    this.swRegistration = await navigator.serviceWorker.register('/next-rsc-websocket-worker.js', {
      scope: '/',
    })
    this.initWebSocket()

    // Listen to messages coming from the Service Worker interceptor
    navigator.serviceWorker.addEventListener('message', async event => {
      const { type, id, url, headers, method, body } = event.data

      if (type === 'REGISTER_CLIENT_STATUS') {
        this.swRegistration?.active?.postMessage({
          type: 'REGISTER_CLIENT_STATUS',
          status: this.ws.readyState === 1,
          clientId: this.clientId,
          id,
        })
      }

      if (type === 'RSC_FETCH_INTERCEPTED') {
        // Forward the HTTP request payloads across the WebSocket channel
        this.ws.send(
          JSON.stringify({
            type: 'RSC_REQUEST',
            id,
            clientId: this.clientId,
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

        if (message.type === 'REGISTER_CLIENT_COMPLETED' && this.ws.readyState === this.ws.OPEN) {
          this.swRegistration?.active?.postMessage({
            type: 'REGISTER_CLIENT_STATUS',
            status: true,
            clientId: this.clientId,
          })
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err)
      }
    }

    this.ws.onopen = () => {
      this.ws.send(
        JSON.stringify({
          type: 'REGISTER_CLIENT',
          clientId: this.clientId,
        }),
      )
    }

    this.ws.onclose = () => {
      this.swRegistration?.active?.postMessage({
        type: 'REGISTER_CLIENT_STATUS',
        status: false,
        clientId: this.clientId,
      })

      // Reconnection logic here
      setTimeout(() => this.initWebSocket(), 3000)
    }
  }
}

const client = new RscWebSocketClient({
  wsUrl: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:${wsPort ?? 8081}/_next/rsc-ws`,
})
client.init().catch(console.error)
