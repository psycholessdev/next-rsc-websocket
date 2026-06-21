// src/ws-server.ts
import { Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'

// Use global symbols to survive Next.js dev server hot-reloading
const GLOBAL_WS_SERVER = Symbol.for('next-rsc-websocket.server')
const GLOBAL_WS_ROUTER = Symbol.for('next-rsc-websocket.router')

interface GlobalCustom {
  [GLOBAL_WS_SERVER]?: WebSocketServer
  [GLOBAL_WS_ROUTER]?: Map<string, WebSocket>
}

const g = globalThis as unknown as GlobalCustom

export function initInternalWebSocketServer(): void {
  // Prevent duplicate hooks across hot-reloads
  if (g[GLOBAL_WS_SERVER]) return

  const wss = new WebSocketServer({ noServer: true })
  const activeClients = new Map<string, WebSocket>()

  g[GLOBAL_WS_SERVER] = wss
  g[GLOBAL_WS_ROUTER] = activeClients

  // Connection orchestration
  wss.on('connection', (ws: WebSocket) => {
    let clientId: string | null = null

    ws.on('message', (message: string) => {
      try {
        const payload = JSON.parse(message)

        // 1. Handshake to register the Main Thread Client ID
        if (payload.type === 'REGISTER_CLIENT') {
          clientId = payload.clientId
          if (clientId) activeClients.set(clientId, ws)
          return
        }

        // 2. Route messages from the Client context to your back-end handler
        if (payload.type === 'RSC_REQUEST') {
          // Trigger your custom RSC handler pipeline or forward to external agents
          // Example: processRscRequest(payload);
        }
      } catch (err) {
        console.error('[RSC WS] Message error:', err)
      }
    })

    ws.on('close', () => {
      if (clientId) activeClients.delete(clientId)
    })
  })

  // Native Hook: Intercept Node.js HTTP layer to automatically capture the Next.js process
  const originalCreateServer = require('http').createServer
  require('http').createServer = function (...args: any[]) {
    const server: HttpServer = originalCreateServer.apply(this, args)

    // Bind into the upgrade pipeline
    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`)

      // Filter out Next.js's native HMR / Fast Refresh websockets
      if (url.pathname === '/_next/webpack-hmr' || url.pathname === '/_next/data') {
        return
      }

      // Check if it targets your library's established pathname
      if (url.pathname === '/_next/rsc-ws') {
        wss.handleUpgrade(request, socket, head, ws => {
          wss.emit('connection', ws, request)
        })
      }
    })

    return server
  }
}

/**
 * Accessor to allow external backend code to push data down to
 * specific active Next.js window client listeners.
 */
export function getActiveRscChannels() {
  return g[GLOBAL_WS_ROUTER] || new Map<string, WebSocket>()
}
