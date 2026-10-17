import {createGateway} from './gateway';
import {readRpcSecret} from '../../../packages/dashboard/src/sync/secrets';
const port=Number(process.env.INCEPT_GATEWAY_PORT??3101),host=process.env.INCEPT_GATEWAY_HOST??'127.0.0.1',webBase=process.env.INCEPT_SYNC_WEB_INTERNAL_URL??'';
if(!Number.isInteger(port)||port<0||port>65535)throw new Error('GATEWAY_PORT_INVALID');
const url=new URL(webBase);if(!['http:','https:'].includes(url.protocol))throw new Error('GATEWAY_WEB_URL_INVALID');
const gateway=createGateway({webBase,secret:readRpcSecret()});
gateway.server.listen(port,host,()=>{console.log(JSON.stringify({event:'gateway_started'}));process.send?.({ready:true,port:(gateway.server.address() as {port:number}).port});});
// Optional parent-process diagnostics for isolated acceptance; never a network RPC.
process.on('message',message=>{if(message&&typeof message==='object'&&'op'in message&&message.op==='stats')process.send?.({stats:gateway.stats()});});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void gateway.close();});
