# Next RSC WebSocket [UNDER DEVELOPMENT]

**🚀 Turbocharge your Next.js App Router applications by routing React Server Component (RSC) payloads over persistent WebSockets.**

Every time your users navigate, click a link, or trigger a Server Action, Next.js fires off a standard HTTP fetch request to get new `_rsc` flight data. `next-rsc-websocket` **completely eliminates the HTTP overhead (TCP handshake, SSL negotiation, bulky headers)** by instantly intercepting these requests and multiplexing them over a single, persistent WebSocket channel.

## Why use this?

💨 **Free Speed Boost**: Blazing-fast page transitions and instantaneous Server Actions.

🛠️ **Zero Hassle**: No static assets to copy, no custom server overrides, and no client directory restructuring.

🛡️ **Rock-Solid Fallback**: Built-in connection lifecycle tracking safely falls back to normal HTTP if the WebSocket connection drops or handles non-RSC data gracefully.

## How It Works

```
[Browser Fetch] -> [Service Worker Interceptor]
                             │
                   (Proxy via WebSocket)
                             │
                             ▼
                   [Client Main Thread]
                             │
                   (Persistent WebSocket)
                             │
                             ▼
                   [Internal Node WS Server] ──► [Next.js App Engine]
```

**Service Worker Interception**: A background service worker transparently catches any client-side request pointing to `?_rsc=...` or matching the `RSC: 1` header.

**WebSocket Pipeline**: The intercepted payload is repackaged and fired down a persistent WebSocket channel.

**Local Dev Server Bridge**: The library automatically handles an internal HTTP server and maps incoming messages straight back to your Next.js instance locally without complex configurations.

## Installation

Install the package:

```bash
npm install next-rsc-websocket
```

## Quick Start

Get up and running in under 60 seconds with just two simple modifications:

1. Wrap your Next.js Configuration
   Open your next.config.js (or next.config.mjs) and wrap your existing configuration with the withRscWebSocket plugin wrapper.

```javascript
// next.config.ts
import type { NextConfig } from 'next'
import { withRscWebSocket } from 'next-rsc-websocket/plugin'

const nextConfig: NextConfig = {
  /* Your existing next config options */
}

export default withRscWebSocket(nextConfig)
```

2. Add the Initialization Script to your Root Layout
   Inject the automated background orchestration layer into your application's primary entry point (app/layout.tsx or app/layout.js).

```typescript
// app/layout.tsx
import Script from 'next/script'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}

        {/* Magic script that sets up the worker environment dynamically */}
        <Script src="/init-rsc-websocket.js" strategy="lazyOnload" />
      </body>
    </html>
  )
}
```

## Configuration Options

While next-rsc-websocket works out-of-the-box with completely optimized defaults, you can pass custom options to withRscWebSocket to fit your environmental needs:

```typescript
export interface PluginConfig {
  wsPort?: number // Target WebSocket Port (Defaults to process.env.RSC_WS_PORT or 8081)
  nextPort?: number // Your Next.js App Port (Defaults to process.env.PORT or 3000)
  swPath?: string // Custom public path for the generated Service Worker code
  clientScriptPath?: string // Custom public path for the client script helper
  isDebug?: boolean // Toggle internal debug lifecycle logging (Defaults to false)
}
```

## Example Custom Configuration

```javascript
export default withRscWebSocket(nextConfig, { wsPort: 8081 })
```

## Technical Details Under the Hood

HMR Resilience: Built using robust globalThis cache layers inside the node runtime, meaning it gracefully survives hot module reloading during fast-paced development cycles without dropping listeners.

Buffer Guards: Implements server-side response body constraint limits (up to 5MB max payload sizes) to ensure huge streaming chunks never flood your process thread unexpectedly.

Automatic Cleanup: Automatically hooks into operating system process signals (SIGINT, SIGTERM) to cleanly teardown backend servers and release active ports.

## License

This project is licensed under the [MIT License](./LICENSE.md).  
You're free to use, modify, and distribute the code, but **please include attribution** by keeping the original license text and a link to this repository.
