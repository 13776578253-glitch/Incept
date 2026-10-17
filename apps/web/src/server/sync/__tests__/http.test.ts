// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {boundedJson,HTTP_LIMITS} from '../http';
afterEach(()=>vi.useRealTimers());
it('bounds actual chunked bytes independently of Content-Length',async()=>{
  const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(Buffer.from('{"value":"'+'x'.repeat(100)+'"}'));c.close();}});
  const request=new Request('http://fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'} as RequestInit);
  await expect(boundedJson(request,32)).rejects.toMatchObject({status:413,code:'REQUEST_BODY_LIMIT'});
});
it('empty optional body is valid, nonempty JSON is checked and wrappers remain strict',async()=>{
  expect(await boundedJson(new Request('http://fixture.invalid',{method:'POST'}),4096,true)).toEqual({});
  await expect(boundedJson(new Request('http://fixture.invalid',{method:'POST',body:'secret',headers:{'Content-Type':'text/plain'}}),4096,true)).rejects.toMatchObject({code:'JSON_REQUIRED'});
});
it('body timeout cannot be mistaken for a complete empty commit',async()=>{
  vi.useFakeTimers();const request=new Request('http://fixture.invalid',{method:'POST',body:new ReadableStream<Uint8Array>({start(){}}),duplex:'half'} as RequestInit);
  const result=expect(boundedJson(request,4096,true)).rejects.toMatchObject({code:'REQUEST_BODY_TIMEOUT',status:408});
  await vi.advanceTimersByTimeAsync(HTTP_LIMITS.bodyTimeoutMs);await result;
});
