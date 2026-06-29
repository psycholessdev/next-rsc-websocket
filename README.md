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
  // Target WebSocket Port (Defaults to process.env.RSC_WS_PORT or 8081)
  wsPort?: number
  // WS port for the client (Allows you to configure Nginx/Apache to proxy WS to "wsPort" internally so client connects to the same port NextJS runs on)
  wsPortForClient?: number
  // Your Next.js App Port (Defaults to process.env.PORT or 3000)
  nextPort?: number
  // Custom public path for the client script helper
  clientScriptPath?: `/${string}`
  // Debug mode (Defaults to false)
  isDebug?: boolean
}
```

## Example Custom Configuration

```javascript
export default withRscWebSocket(nextConfig, { wsPort: 8081 })
```

## Nginx Configuration

Update following block inside your `server` configuration. This ensures that regular traffic passes to Next.js, while the paths matching `/_next/rsc-ws` are upgraded to a WebSocket connection on your designated `wsPort` (defaulting to `8081`).

```conf
# Map block to dynamically set Connection header based on Upgrade header
map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 443 ssl;
  server_name yourdomain.com;

  # 1. Route standard Next.js web application traffic
  location / {
    proxy_pass http://127.0.0.1:3000; # Your Next.js dockername and port
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded-for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # 2. Route Dedicated next-rsc-websocket Flight Channel (Add this)
  location /_next/rsc-ws {
    proxy_pass http://127.0.0.1:8081; # Your next-rsc-websocket wsPort
    proxy_http_version 1.1;

    # Critical headers required for WebSocket handshakes
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded-for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Optional: Adjust read/send timeouts for long-lived WS connections
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
  }
}
```

## Apache Configuration

For Apache, make sure you have `mod_proxy`, `mod_proxy_http`, and `mod_proxy_wstunnel` enabled:

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel
```

Then, configure your standard VirtualHost block. **Note**: Apache processes rules from top to bottom, so the WebSocket `ws://` rule must be placed above the general `http://` catch-all route.

```conf
<VirtualHost *:443>
  ServerName yourdomain.com

  SSLEngine on
  SSLCertificateFile /path/to/cert.pem
  SSLCertificateKeyFile /path/to/key.pem

  ProxyRequests Off
  ProxyPreserveHost On

  # 1. Route Dedicated next-rsc-websocket Flight Channel (WSS Upgrade)
  # This intercepts the handshake and proxies it cleanly over the ws tunnel
  ProxyPass /_next/rsc-ws ws://127.0.0.1:8081/_next/rsc-ws
  ProxyPassReverse /_next/rsc-ws ws://127.0.0.1:8081/_next/rsc-ws

  # 2. Route standard Next.js web application traffic
  ProxyPass / http://127.0.0.1:3000/ # Your Next.js dockername and port
  ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

## Technical Details Under the Hood

HMR Resilience: Built using robust globalThis cache layers inside the node runtime, meaning it gracefully survives hot module reloading during fast-paced development cycles without dropping listeners.

Buffer Guards: Implements server-side response body constraint limits (up to 5MB max payload sizes) to ensure huge streaming chunks never flood your process thread unexpectedly.

Automatic Cleanup: Automatically hooks into operating system process signals (SIGINT, SIGTERM) to cleanly teardown backend servers and release active ports.

## License

This project is licensed under the [MIT License](./LICENSE.md).  
You're free to use, modify, and distribute the code, but **please include attribution** by keeping the original license text and a link to this repository.
