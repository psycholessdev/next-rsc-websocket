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

export function startInternalAssetServer(swCode: string): Promise<number> {
  if (allocatedPort) return Promise.resolve(allocatedPort)
  if (serverPromise) return serverPromise

  registerCleanup()

  const swCodeEtag = crypto.createHash('sha256').update(swCode).digest('hex')

  serverPromise = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // If client already has the same version
      if (req.headers['if-none-match'] === swCodeEtag) {
        res.writeHead(304, {
          ETag: swCodeEtag,
          'Cache-Control': 'public, max-age=1800',
        })
        res.end()
        return
      }

      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Service-Worker-Allowed': '/',
        'Cache-Control': 'public, max-age=1800',
        ETag: swCodeEtag,
        'Access-Control-Allow-Origin': '*',
      })

      res.end(swCode)
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
