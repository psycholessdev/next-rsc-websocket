import http from 'http'
import crypto from 'crypto'

let localAssetServer: http.Server | null = null
let allocatedPort = 0
let serverPromise: Promise<number> | null = null
let cleanupRegistered = false

function registerCleanup() {
  if (cleanupRegistered) return
  cleanupRegistered = true

  const shutdown = () => {
    if (localAssetServer) {
      localAssetServer.close()
      localAssetServer = null
      allocatedPort = 0
      serverPromise = null
    }
  }

  process.once('exit', shutdown)
  process.once('SIGINT', () => {
    shutdown()
    process.exit(0)
  })
  process.once('SIGTERM', () => {
    shutdown()
    process.exit(0)
  })
}

type AssetsMap = Record<string, string>

export function startInternalAssetServer(assetsMap: AssetsMap): Promise<number> {
  if (allocatedPort) return Promise.resolve(allocatedPort)
  if (serverPromise) return serverPromise
  registerCleanup()

  // cache Etag revalidation
  const etags = new Map<string, string>()
  Object.entries(assetsMap).forEach(([path, content]) => {
    etags.set(path, `"${crypto.createHash('sha256').update(content).digest('hex')}"`)
  })

  serverPromise = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url || !assetsMap[req.url] || !etags.has(req.url)) {
        return res.writeHead(404).end()
      }

      // If client already has the same version
      if (req.headers['if-none-match'] === etags.get(req.url)) {
        res.writeHead(304, {
          ETag: etags.get(req.url),
          'Cache-Control': 'public, max-age=1800',
        })
        return res.end()
      }

      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Service-Worker-Allowed': '/',
        'Cache-Control': 'public, max-age=1800',
        ETag: etags.get(req.url),
        'Access-Control-Allow-Origin': '*',
      })
      res.end(assetsMap[req.url])
    })

    server.once('error', err => {
      localAssetServer = null
      serverPromise = null
      reject(err)
    })

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address !== 'object') {
        server.close()
        localAssetServer = null
        serverPromise = null
        reject(new Error('Failed to determine server port'))
        return
      }

      localAssetServer = server
      allocatedPort = address.port

      resolve(allocatedPort)
    })
  })

  return serverPromise
}
