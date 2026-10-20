import {createServer,request as httpRequest} from 'node:http';
import {pathToFileURL} from 'node:url';

const bodyLimit = 2 * 1024 * 1024;
function cleanHeaders(headers) {
  const remove = new Set(['connection','keep-alive','proxy-connection','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','forwarded']);
  for (const token of String(headers.connection ?? '').split(',')) remove.add(token.trim().toLowerCase());
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !remove.has(name.toLowerCase())));
}

// One fixed HTTP destination. No CONNECT, upgrades, dynamic URLs or routing.
export function createAcceptanceProxy(requestFn = httpRequest) {
  const server = createServer((req,res) => {
    if (!req.url?.startsWith('/') || req.url.startsWith('//') || /[\\\x00-\x20\x7f]/.test(req.url)) { res.writeHead(400).end(); return; }
    if (Number(req.headers['content-length'] ?? 0) > bodyLimit) { res.writeHead(413).end(); return; }
    const headers = cleanHeaders(req.headers);
    for (const key of Object.keys(headers)) if (key.startsWith('x-forwarded-')) delete headers[key];
    Object.assign(headers,{host:'127.0.0.1:3305','x-forwarded-host':'127.0.0.1:3305','x-forwarded-proto':'http','x-forwarded-port':'3305','x-forwarded-for':req.socket.remoteAddress ?? ''});
    let bytes=0, failed=false, upstream;
    const badGateway=()=>{ if(failed)return; failed=true; if(!res.headersSent)res.writeHead(502,{'content-type':'text/plain'}).end('UPSTREAM_UNAVAILABLE');else res.destroy(); };
    try {
      upstream=requestFn({hostname:'app',port:3000,method:req.method,path:req.url,headers},incoming=>{
        if(failed){incoming.destroy();return;}
        res.writeHead(incoming.statusCode ?? 502,cleanHeaders(incoming.headers));
        incoming.on('error',badGateway);incoming.pipe(res);
      });
      upstream.on('error',badGateway);
      upstream.setTimeout(90_000,()=>upstream.destroy());
      req.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>bodyLimit&&!failed){failed=true;req.unpipe(upstream);upstream.destroy();if(!res.headersSent)res.writeHead(413).end();else res.destroy();req.resume();}
      });
      req.on('aborted',()=>upstream.destroy());
      res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});
      req.pipe(upstream);
    } catch { badGateway(); }
  });
  const rejectTunnel=(_req,socket)=>{socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');};
  server.on('connect',rejectTunnel);server.on('upgrade',rejectTunnel);
  server.headersTimeout=15_000;server.requestTimeout=180_000;server.maxHeadersCount=100;
  return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const server=createAcceptanceProxy();
  server.listen(8080,'0.0.0.0');
  const stop=()=>{server.close(()=>process.exit(0));setTimeout(()=>{server.closeAllConnections();process.exit(0);},5000).unref();};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
}
