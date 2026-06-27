// src/plugin.ts
import type { NextConfig } from 'next'
import { startInternalAssetServer } from './internal-asset-server'
import { initInternalWebSocketServer } from './ws-server'

export interface PluginOptions {
  swPath?: string
}

export function withRscWebSocket(nextConfig: NextConfig = {}) {
  // Automatically bind the safe backend WebSocket interceptor
  if (typeof window === 'undefined') {
    const wsPort = Number(process.env?.NEXT_PUBLIC_RSC_WS_PORT || process.env?.RSC_WS_PORT || 8081)
    initInternalWebSocketServer(wsPort)
  }

  // Bundled Service Worker (compiled during prebuild)
  const swCode = /*<INJECTED_SW_CODE>*/ "\"use strict\";(()=>{var u=new Map,d=new Map;self.addEventListener(\"install\",()=>{self.skipWaiting()});self.addEventListener(\"activate\",e=>{e.waitUntil(self.clients.claim())});self.addEventListener(\"fetch\",e=>{let n=new URL(e.request.url);(n.searchParams.has(\"_rsc\")||e.request.headers.get(\"RSC\")===\"1\")&&e.respondWith(new Promise(async r=>{let s=await self.clients.get(e.clientId),i=crypto.randomUUID();d.set(i,r);let c=null;[\"POST\",\"PUT\",\"PATCH\"].includes(e.request.method)&&(c=await e.request.text());let t={};e.request.headers.forEach((a,l)=>{t[l]=a}),s&&u.get(s.id)?s.postMessage({type:\"RSC_FETCH_INTERCEPTED\",id:i,url:e.request.url,method:e.request.method,headers:t,body:c}):(console.error(`[next-rsc-websocket] proxy failed for ${n}`),fetch(e.request).then(r))}))});self.addEventListener(\"message\",e=>{let{type:n,id:o,clientId:r,status:s,headers:i,body:c}=e.data,t=e.source;if(n===\"REGISTER_CLIENT_STATUS\"&&t instanceof Client&&t.type===\"window\"&&(u.set(t.id,s),console.log(`[next-rsc-websocket] WS Connection ${s?\"established and proxing enabled\":\"failed, defaulting to fetch strategy\"} (clientId: ${r}; sourceId: ${t.id})`)),n===\"RSC_RESPONSE_DATA\"&&d.has(o)){let a=d.get(o);if(a){let l=new Response(c,{status:s,headers:new Headers({...i,\"Content-Type\":\"text/x-component; charset=utf-8\"})});a(l),d.delete(o),console.log(`[next-rsc-websocket] proxied ${o}`)}}});})();" /*</INJECTED_SW_CODE>*/

  return {
    ...nextConfig,
    async rewrites() {
      const existingRewrites = nextConfig?.rewrites ? await nextConfig.rewrites() : []

      // This safely redirects Next.js to our internal memory stream via standard proxying
      const port = await startInternalAssetServer(swCode)
      const swRewrite = {
        source: '/next-rsc-websocket.js',
        destination: `http://127.0.0.1:${port}/next-rsc-websocket.js`,
      }

      if (Array.isArray(existingRewrites)) {
        return [...existingRewrites, swRewrite]
      }
      if (existingRewrites && typeof existingRewrites === 'object') {
        return {
          ...existingRewrites,
          beforeFiles: [...(existingRewrites?.beforeFiles || []), swRewrite],
        }
      }
      return [swRewrite]
    },
  }
}
