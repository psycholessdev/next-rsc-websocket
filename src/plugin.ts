// src/plugin.ts
import type { NextConfig } from 'next'
import { startInternalAssetServer } from './internal-asset-server'
import { initInternalWebSocketServer } from './ws-server'
import { getNextPort } from './get-next-port'

export interface PluginConfig {
  wsPort?: number
  nextPort?: number
  swPath?: `/${string}`
  clientScriptPath?: `/${string}`
  isDebug?: boolean
}

export function withRscWebSocket(
  nextConfig: NextConfig = {},
  {
    wsPort = Number(process.env?.NEXT_PUBLIC_RSC_WS_PORT || process.env?.RSC_WS_PORT || 8081),
    nextPort = Number(process.env?.NEXT_PUBLIC_PORT || process.env?.PORT || getNextPort(3000)),
    swPath = '/next-rsc-websocket.js',
    clientScriptPath = '/init-rsc-websocket.js',
    isDebug = Boolean(process.env?.NEXT_PUBLIC_RSC_WS_DEBUG || process.env?.RSC_WS_DEBUG || false),
  }: PluginConfig = {},
) {
  // Automatically bind the safe backend WebSocket interceptor
  if (typeof window === 'undefined') {
    initInternalWebSocketServer({ wsPort, nextPort, isDebug })
  }

  // Bundled Service Worker (compiled during prebuild)
  const swCode =
    /*<INJECTED_SW_CODE>*/ '"use strict";(()=>{var u=new Map,d=new Map;self.addEventListener("install",()=>{self.skipWaiting()});self.addEventListener("activate",e=>{e.waitUntil(self.clients.claim())});self.addEventListener("fetch",e=>{let n=new URL(e.request.url);(n.searchParams.has("_rsc")||e.request.headers.get("RSC")==="1")&&e.respondWith(new Promise(async r=>{let s=await self.clients.get(e.clientId),i=crypto.randomUUID();d.set(i,r);let c=null;["POST","PUT","PATCH"].includes(e.request.method)&&(c=await e.request.text());let t={};e.request.headers.forEach((a,l)=>{t[l]=a}),s&&u.get(s.id)?s.postMessage({type:"RSC_FETCH_INTERCEPTED",id:i,url:e.request.url,method:e.request.method,headers:t,body:c}):(console.error(`[next-rsc-websocket] proxy failed for ${n}`),fetch(e.request).then(r))}))});self.addEventListener("message",e=>{let{type:n,id:o,clientId:r,status:s,headers:i,body:c}=e.data,t=e.source;if(n==="REGISTER_CLIENT_STATUS"&&t instanceof Client&&t.type==="window"&&(u.set(t.id,s),console.log(`[next-rsc-websocket] WS Connection ${s?"established and proxing enabled":"failed, defaulting to fetch strategy"} (clientId: ${r}; sourceId: ${t.id})`)),n==="RSC_RESPONSE_DATA"&&d.has(o)){let a=d.get(o);if(a){let l=new Response(c,{status:s,headers:new Headers({...i,"Content-Type":"text/x-component; charset=utf-8"})});a(l),d.delete(o),console.log(`[next-rsc-websocket] proxied ${o}`)}}});})();' /*</INJECTED_SW_CODE>*/
  let clientCode =
    /*<INJECTED_CLIENT_CODE>*/ '"use strict";(()=>{var n=class{ws;swRegistration=null;config;pendingRequests=new Map;clientId;constructor(e){this.config=e,this.clientId=crypto.randomUUID()}async init(){if(!(typeof window>"u"||!("serviceWorker"in navigator))){if(!this.config.wsUrl){let e=window.location.protocol==="https:"?"wss:":"ws:";this.config.wsUrl=`${e}//${window.location.host}/_next/rsc-ws`}this.swRegistration=await navigator.serviceWorker.register("/next-rsc-websocket.js",{scope:"/"}),this.initWebSocket(),navigator.serviceWorker.addEventListener("message",async e=>{let{type:t,id:s,url:o,headers:r,method:a,body:c}=e.data;t==="REGISTER_CLIENT_STATUS"&&this.swRegistration?.active?.postMessage({type:"REGISTER_CLIENT_STATUS",status:this.ws.readyState===1,clientId:this.clientId,id:s}),t==="RSC_FETCH_INTERCEPTED"&&(this.ws.send(JSON.stringify({type:"RSC_REQUEST",id:s,clientId:this.clientId,url:o,method:a,headers:r,body:c})),this.pendingRequests.set(s,i=>{this.swRegistration?.active?.postMessage({type:"RSC_RESPONSE_DATA",id:s,status:i.status||200,headers:i.headers||{},body:i.body})}))})}}initWebSocket(){this.ws=new WebSocket(this.config.wsUrl),this.ws.onmessage=e=>{try{let t=JSON.parse(e.data);if(t.type==="RSC_RESPONSE"&&this.pendingRequests.has(t.id)){let s=this.pendingRequests.get(t.id);s&&(s(t),this.pendingRequests.delete(t.id))}t.type==="REGISTER_CLIENT_COMPLETED"&&this.ws.readyState===this.ws.OPEN&&this.swRegistration?.active?.postMessage({type:"REGISTER_CLIENT_STATUS",status:!0,clientId:this.clientId})}catch(t){console.error("Error parsing WebSocket message:",t)}},this.ws.onopen=()=>{this.ws.send(JSON.stringify({type:"REGISTER_CLIENT",clientId:this.clientId}))},this.ws.onclose=()=>{this.swRegistration?.active?.postMessage({type:"REGISTER_CLIENT_STATUS",status:!1,clientId:this.clientId}),setTimeout(()=>this.initWebSocket(),3e3)}}},d=new n({wsUrl:`ws://${location.hostname}:${window?.wsPort??8081}/_next/rsc-ws`});d.init().catch(console.error);})();' /*</INJECTED_CLIENT_CODE>*/
  clientCode.replace('${window?.wsPort??8081}', `\${${wsPort}}`)

  return {
    ...nextConfig,
    async rewrites() {
      const existingRewrites = nextConfig?.rewrites ? await nextConfig.rewrites() : []

      // This safely redirects Next.js to our internal memory stream via standard proxying
      const port = await startInternalAssetServer({
        [swPath]: swCode,
        [clientScriptPath]: clientCode,
      })
      const rewrites = [
        {
          source: swPath,
          destination: `http://127.0.0.1:${port}${swPath}`,
        },
        {
          source: clientScriptPath,
          destination: `http://127.0.0.1:${port}${clientScriptPath}`,
        },
      ]

      if (Array.isArray(existingRewrites)) {
        return [...existingRewrites, ...rewrites]
      }
      if (existingRewrites && typeof existingRewrites === 'object') {
        return {
          ...existingRewrites,
          beforeFiles: [...(existingRewrites?.beforeFiles || []), ...rewrites],
        }
      }
      return rewrites
    },
  }
}
