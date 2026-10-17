declare module 'next/dist/compiled/ws' {
  import type {IncomingMessage} from 'node:http';
  import type {Duplex} from 'node:stream';
  import type {EventEmitter} from 'node:events';
  export interface Socket extends EventEmitter {readyState:number;bufferedAmount:number;send(data:string):void;close(code?:number,reason?:string):void;terminate():void;ping():void;}
  export class Server extends EventEmitter {constructor(options:{noServer:boolean;maxPayload:number;perMessageDeflate:boolean});handleUpgrade(req:IncomingMessage,socket:Duplex,head:Buffer,done:(ws:Socket)=>void):void;close():void;}
  const ws:{Server:typeof Server};export default ws;
}
