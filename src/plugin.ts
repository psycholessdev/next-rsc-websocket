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
    initInternalWebSocketServer()
  }

  // This is the bundled string of your Service Worker (compiled during prebuild)
  const swCode = /*<INJECTED_SW_CODE>*/ "\"use strict\";(()=>{var d=new Map,a=new Map;self.addEventListener(\"install\",()=>{self.skipWaiting()});self.addEventListener(\"activate\",e=>{e.waitUntil(self.clients.claim())});self.addEventListener(\"fetch\",e=>{let o=new URL(e.request.url);(o.searchParams.has(\"_rsc\")||e.request.headers.get(\"RSC\")===\"1\")&&e.respondWith(new Promise(async t=>{let r=await self.clients.get(e.clientId),i=crypto.randomUUID();a.set(i,t);let n=null;[\"POST\",\"PUT\",\"PATCH\"].includes(e.request.method)&&(n=await e.request.text());let c={};e.request.headers.forEach((l,u)=>{c[u]=l}),r&&d.get(r.id)?r.postMessage({type:\"RSC_FETCH_INTERCEPTED\",id:i,url:e.request.url,method:e.request.method,headers:c,body:n}):(console.error(`[next-rsc-websocket] proxy failed for ${o}`),fetch(e.request).then(t))}))});self.addEventListener(\"message\",e=>{let{type:o,id:s,status:t,headers:r,body:i}=e.data,n=e.source;if(o===\"GET_AVAILABILITY\"&&n instanceof Client&&n.type===\"window\"&&(console.log(`[next-rsc-websocket] GET_AVAILABILITY: id: ${s} , status: ${t}`),d.set(n.id,t)),o===\"RSC_RESPONSE_DATA\"&&a.has(s)){let c=a.get(s);if(c){let l=new Response(i,{status:t,headers:new Headers({...r,\"Content-Type\":\"text/x-component; charset=utf-8\"})});c(l),a.delete(s),console.log(`[next-rsc-websocket] proxied ${s}`)}}});})();" /*</INJECTED_SW_CODE>*/

  return {
    ...nextConfig,
    async rewrites() {
      const existingRewrites = nextConfig?.rewrites ? await nextConfig.rewrites() : []

      // This safely redirects Next.js to our internal memory stream via standard proxying
      const port = await startInternalAssetServer(swCode)
      const swRewrite = {
        source: '/next-rsc-worker.js',
        destination: `http://127.0.0.1:${port}/next-rsc-worker.js`,
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
