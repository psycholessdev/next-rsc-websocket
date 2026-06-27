# Next RSC WebSocket [UNDER DEVELOPMENT]

Seamlessly intercept Next.js React Server Component (`_rsc`) requests and proxy them over a persistent, self-healing WebSocket connection. 

Zero public directory clutter. Zero extra server ports to manage.

---

## Features

* 🔌 **Zero-Config Asset Serving**: Uses an internal memory asset server to inject the Service Worker dynamically — no file copying required in your `public/` directory.
* 🚀 **Single Port Architecture**: Hooks directly into the existing Next.js Node.js server. Your WebSockets run on the exact same port (e.g., `localhost:3000`), inheriting your SSL and reverse-proxy configurations natively.
* 🔄 **HMR & Fast-Refresh Safe**: Utilizes global process singletons to prevent `EADDRINUSE` port crashes or duplicate event registrations during Next.js development reloads.
* 📦 **TypeScript Native**: Full type safety for plugin configurations, client initializers, and message payloads.

---

## Architecture Overview

1. **The Plugin (`next.config.js`)**: Hooks into Node's `http.createServer` to capture the Next.js runtime, routing `/_next/rsc-ws` traffic to a dynamic WebSocket server, while spinning up a lightweight local memory streaming engine to serve the Service Worker asset.
2. **The Service Worker**: Intercepts browser `fetch` events targeting `_rsc` URLs or containing `RSC: 1` headers, holds the HTTP connection open, and hands off the execution context to the main thread.
3. **The Client**: Establishes a WebSocket bridge to the Next.js server, receiving requests pushed by the Service Worker, sending them across the WebSocket, and delivering back the streaming response payload.

---

## Installation

Install the package via your preferred package manager:

```bash
npm install next-rsc-websocket
```
