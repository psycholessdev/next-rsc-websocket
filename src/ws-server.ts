// src/ws-server.ts
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'

const GLOBAL_WS_SERVER = Symbol.for('next-rsc-websocket.server')
const GLOBAL_WS_HTTP = Symbol.for('next-rsc-websocket.http')
const GLOBAL_WS_ROUTER = Symbol.for('next-rsc-websocket.router')
const GLOBAL_WS_PORT = Symbol.for('next-rsc-websocket.port')
const GLOBAL_WS_CLEANUP_REGISTERED = Symbol.for('next-rsc-websocket.cleanupRegistered')

interface GlobalCustom {
  [GLOBAL_WS_SERVER]?: WebSocketServer
  [GLOBAL_WS_HTTP]?: http.Server
  [GLOBAL_WS_ROUTER]?: Map<string, WebSocket>
  [GLOBAL_WS_PORT]?: number
  [GLOBAL_WS_CLEANUP_REGISTERED]?: boolean
}

const g = globalThis as unknown as GlobalCustom

type WSRequestPayload =
  | {
      type: string
      clientId?: string
    }
  | RscRequestPayload

type WebSocketServerConfig = {
  wsPort?: number
  nextPort?: number
  isDebug?: boolean
}

export async function initInternalWebSocketServer({
  wsPort = 0,
  nextPort = 3000,
  isDebug = false,
}: WebSocketServerConfig = {}): Promise<number> {
  // Survive HMR
  if (g[GLOBAL_WS_SERVER] && g[GLOBAL_WS_PORT]) {
    return g[GLOBAL_WS_PORT]
  }

  const activeClients = new Map<string, WebSocket>()
  const server = http.createServer((_, res) => {
    res.statusCode = 404
    res.end()
  })
  const wss = new WebSocketServer({
    server,
    path: '/_next/rsc-ws',
  })

  g[GLOBAL_WS_SERVER] = wss
  g[GLOBAL_WS_HTTP] = server
  g[GLOBAL_WS_ROUTER] = activeClients

  wss.on('connection', (ws: WebSocket) => {
    let clientId: string | null | undefined = null

    ws.on('message', raw => {
      try {
        const payload = JSON.parse(raw.toString() || '{}') as WSRequestPayload

        if (payload.type === 'REGISTER_CLIENT') {
          clientId = payload?.clientId

          if (clientId && ws.readyState === ws.OPEN) {
            const previous = activeClients.get(clientId)

            if (previous && previous !== ws) {
              previous.close(1000, 'Replaced by newer connection')
            }

            activeClients.set(clientId, ws)
            ws.send(
              JSON.stringify({
                type: 'REGISTER_CLIENT_COMPLETED',
                clientId: payload.clientId,
                status: 200,
              }),
            )
            if (isDebug) {
              console.log(`[RSC WS] [debug] Registered client: ${clientId}`)
            }
          }

          return
        }

        if (payload.type === 'RSC_REQUEST') {
          if (isDebug) console.log(`[RSC WS] [debug] Proxying RSC_REQUEST: ${clientId}`)
          processRscRequest(payload as RscRequestPayload, nextPort)
        }
      } catch (err) {
        console.error('[RSC WS] Message error:', err)
      }
    })

    ws.on('close', () => {
      if (!clientId) return

      const current = activeClients.get(clientId)
      if (current === ws) activeClients.delete(clientId)
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.listen({ host: '127.0.0.1', port: wsPort }, resolve)
    server.once('error', reject)
    server.on('close', () => {
      delete g[GLOBAL_WS_SERVER]
      delete g[GLOBAL_WS_HTTP]
      delete g[GLOBAL_WS_ROUTER]
      delete g[GLOBAL_WS_PORT]
      delete g[GLOBAL_WS_CLEANUP_REGISTERED]
    })
  })

  // cleanup
  let shuttingDown = false
  let shutdownPromise: Promise<void> | null = null
  const shutdown = () => {
    if (shuttingDown) return shutdownPromise
    shuttingDown = true

    shutdownPromise = new Promise<void>(resolve => {
      try {
        for (const ws of wss.clients) {
          try {
            ws.terminate()
          } catch {}
        }

        wss.close()
        server.close(() => {
          delete g[GLOBAL_WS_SERVER]
          delete g[GLOBAL_WS_HTTP]
          delete g[GLOBAL_WS_ROUTER]
          delete g[GLOBAL_WS_PORT]
          delete g[GLOBAL_WS_CLEANUP_REGISTERED]
          console.log('[RSC WS] graceful shut down finished')
          resolve()
        })
      } catch (err) {
        console.error('[RSC WS] shutdown error:', err)
        resolve()
      }
    })

    return shutdownPromise
  }
  if (!g[GLOBAL_WS_CLEANUP_REGISTERED]) {
    g[GLOBAL_WS_CLEANUP_REGISTERED] = true

    process.once('SIGINT', async () => {
      await shutdown()
      process.exit(0)
    })
    process.once('SIGTERM', async () => {
      await shutdown()
      process.exit(0)
    })
    process.once('uncaughtException', async err => {
      console.error(err)
      await shutdown()
      process.exit(1)
    })
    // unreliable (does not wait for the promise)
    // process.once('beforeExit', shutdown)
    // process.once('exit', shutdown)
  }

  const address = server.address()

  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine websocket port')
  }

  g[GLOBAL_WS_PORT] = address.port
  console.log(`[next-rsc-websocket] listening on ws://127.0.0.1:${address.port}/_next/rsc-ws`)
  return address.port
}

interface RscRequestPayload {
  type: 'RSC_REQUEST'
  id: string
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  clientId: string
}

export function processRscRequest(payload: RscRequestPayload, nextPort = 3000): void {
  const activeChannels = getActiveRscChannels()
  const targetSocket = activeChannels.get(payload.clientId)

  if (!targetSocket || targetSocket.readyState !== targetSocket.OPEN) {
    console.error(
      `[next-rsc-websocket] Active socket channel missing for client: ${payload.clientId}`,
    )
    return
  }

  // TODO prevent DDOS or third party resourse requests
  // TODO infer NextJS local address
  const targetUrl = new URL(payload.url)
  targetUrl.protocol = 'http:'
  targetUrl.hostname = '127.0.0.1'
  targetUrl.port = nextPort.toString()

  // Clean headers to prevent NextJS from replying with gzip/br encoding
  // that would require manual inflation before passing to WS
  const cleanedHeaders = { ...payload.headers }
  delete cleanedHeaders['accept-encoding']
  delete cleanedHeaders['host']

  if (!targetUrl.searchParams.has('_rsc') && cleanedHeaders['RSC'] !== '1') {
    targetSocket.send(
      JSON.stringify({
        type: 'RSC_RESPONSE',
        id: payload.id,
        status: 400,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Forbidden: non-RSC request',
        reason: 'Non-RSC request',
      }),
    )
    return
  }

  const options: http.RequestOptions = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || 3000,
    path: targetUrl.pathname + targetUrl.search,
    method: payload.method,
    headers: cleanedHeaders,
  }

  const req = http.request(options, res => {
    const MAX_RESPONSE = 5 * 1024 * 1024
    let size = 0
    let bodyData = ''

    res.setEncoding('utf8')
    res.on('data', chunk => {
      size += chunk.length

      if (size > MAX_RESPONSE) {
        req.destroy(new Error('[next-rsc-websocket] Response too large'))
        return
      }

      bodyData += chunk
    })

    res.on('end', () => {
      const responseHeaders: Record<string, string> = {}
      Object.entries(res.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value
        }
      })

      // Dispatch response structure back to the precise client socket connection
      if (targetSocket.readyState === targetSocket.OPEN) {
        targetSocket.send(
          JSON.stringify({
            type: 'RSC_RESPONSE',
            id: payload.id,
            status: res.statusCode || 200,
            headers: responseHeaders,
            body: bodyData,
          }),
        )
      }
    })
  })

  req.setTimeout(30000, () => req.destroy(new Error('[next-rsc-websocket] Request timeout')))

  req.on('error', err => {
    console.error(`[next-rsc-websocket] Target pipeline error proxying ${payload.id}:`, err)

    if (targetSocket.readyState === targetSocket.OPEN) {
      targetSocket.send(
        JSON.stringify({
          type: 'RSC_RESPONSE',
          id: payload.id,
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
          body: 'Bad Gateway proxying internal flight data over connection.',
        }),
      )
    }
  })

  if (payload.body) req.write(payload.body)
  req.end()
}

export function getInternalWebSocketPort(): number | undefined {
  return g[GLOBAL_WS_PORT]
}

export function getActiveRscChannels() {
  return g[GLOBAL_WS_ROUTER] ?? new Map<string, WebSocket>()
}
