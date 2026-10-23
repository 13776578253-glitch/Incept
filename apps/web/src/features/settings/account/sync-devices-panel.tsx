'use client';
import {useEffect,useState} from 'react';
type Device={id:string;name:string;tokenHint:string;revokedAt:string|null;lastUsedAt:string|null;allowedSources:string[]};
type SyncReview={id:number|string;source:string;sessionSummary:string;code:string;createdAt:string;oldDataRetained:boolean;nextStep:string};
export function SyncDevicesPanel({language}:{language:'zh'|'en'}) {
  const t=(zh:string,en:string)=>language==='zh'?zh:en;
  const [devices,setDevices]=useState<Device[]|null>(null),[name,setName]=useState(''),[secret,setSecret]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [binding,setBinding]=useState(''),[source,setSource]=useState('codex'),[session,setSession]=useState(''),[origin,setOrigin]=useState('');
  const [legacyId,setLegacyId]=useState('');
  const [reviews,setReviews]=useState<SyncReview[]|null>(null);
  const [editingSources,setEditingSources]=useState(''),[sourceDraft,setSourceDraft]=useState<string[]>([]);
  const sources=['codex','commandcode','claudeCode','geminiCli','antigravity','opencode','zcode','deepseekHarness'];
  const [allowedSources,setAllowedSources]=useState(sources);
  useEffect(()=>{const clear=()=>{if(document.visibilityState!=='visible')setSecret(null);};document.addEventListener('visibilitychange',clear);return()=>document.removeEventListener('visibilitychange',clear);},[]);
  async function request(path='',method='GET',body?:unknown) {
    const result=await fetch('/api/dashboard/sync/devices'+path,{method,credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await result.json();if(!result.ok)throw new Error(data.error??'SERVICE_UNAVAILABLE');return data;
  }
  async function run(action:()=>Promise<void>) {setBusy(true);setError('');setSecret(null);try{await action();}catch(e){setError(e instanceof Error?e.message:'SERVICE_UNAVAILABLE');}finally{setBusy(false);}}
  async function loadReviews(){const result=await fetch('/api/dashboard/sync/reviews',{credentials:'same-origin',cache:'no-store'});const data=await result.json();if(!result.ok)throw new Error(data.error??'SERVICE_UNAVAILABLE');setReviews(data.reviews??[]);}
  async function load(){setDevices((await request()).devices);}
  const button='rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs disabled:opacity-50';
  const input='rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm';
  return <section className="space-y-3 border-t border-[var(--color-border)] pt-4">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">{t('Token 同步设备','Token sync devices')}</h3><div className="flex gap-2"><button className={button} disabled={busy} onClick={()=>void run(load)}>{t('管理设备','Manage devices')}</button><button className={button} disabled={busy} onClick={()=>void run(loadReviews)}>{t('检查历史冲突','Check history conflicts')}</button></div></div>
    {error&&<p role="alert" className="text-xs">{error==='SYNC_DISABLED'?t('本地同步入口尚未启用。','Local sync is disabled.'):error==='reauthentication_required'?t('请先点击上方“验证身份”，再重试。','Verify your identity above, then retry.'):error}</p>}
    {devices&&<>
      <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await request('','POST',{name,allowedSources,...(legacyId?{legacyDeviceId:legacyId}:{})});setName('');setLegacyId('');await load();setSecret(result.token);});}}>
        <input aria-label={t('同步设备名称','Sync device name')} placeholder={t('例如：Windows 台式机','e.g. Windows desktop')} className={input} maxLength={80} value={name} onChange={e=>setName(e.target.value)} required/>
        <input aria-label={t('已有 v1 设备 UUID（选填）','Existing v1 device UUID (optional)')} className={input} maxLength={36} value={legacyId} onChange={e=>setLegacyId(e.target.value)}/>
        <p className="w-full text-xs text-[var(--color-text-muted)]">{t('名称只是显示标签，之后可随时改名。v1 UUID 仅在接管旧设备时填写，通常留空。','The name is only a label and can be renamed later. Fill the v1 UUID only when taking over an existing device; usually leave it empty.')}</p>
        <fieldset className="flex w-full flex-wrap gap-3"><legend className="text-xs">{t('允许自动同步的数据源','Sources allowed to sync automatically')}</legend>{sources.map(item=><label key={item} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={allowedSources.includes(item)} onChange={e=>setAllowedSources(current=>e.target.checked?[...current,item]:current.filter(source=>source!==item))}/>{item}</label>)}</fieldset>
        <button className={button} disabled={busy||!allowedSources.length}>{t('登记设备','Register device')}</button>
      </form>
      {devices.map(device=><div key={device.id} className="space-y-2 rounded-lg border border-[var(--color-border)] p-3 text-xs">
        <p>{device.name} · {device.id} · …{device.tokenHint} {device.revokedAt?t('已吊销','Revoked'):''}</p>
        <p>{t('已授权来源：','Allowed sources: ')}{device.allowedSources.join(', ')}</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy||!!device.revokedAt} onClick={()=>void run(async()=>{const result=await request('/'+device.id+'/rotate','POST');await load();setSecret(result.token);})}>{t('轮换凭据','Rotate token')}</button>
          <button className={button} disabled={busy||!!device.revokedAt} onClick={()=>void run(async()=>{await request('/'+device.id,'DELETE');await load();})}>{t('吊销','Revoke')}</button>
          <button className={button} disabled={busy} onClick={()=>{const value=window.prompt(t('新设备名称','New device name'),device.name);if(value)void run(async()=>{await request('/'+device.id,'PATCH',{name:value});await load();});}}>{t('改名','Rename')}</button>
          <button className={button} disabled={busy||!!device.revokedAt} onClick={()=>setBinding(binding===device.id?'':device.id)}>{t('绑定来源范围','Bind source scope')}</button>
          <button className={button} disabled={busy||!!device.revokedAt} onClick={()=>{setEditingSources(editingSources===device.id?'':device.id);setSourceDraft(device.allowedSources);}}>{t('编辑来源','Edit sources')}</button>
        </div>
        {editingSources===device.id&&<form className="space-y-2" onSubmit={e=>{e.preventDefault();void run(async()=>{await request('/'+device.id,'PATCH',{allowedSources:sourceDraft});setEditingSources('');await load();});}}>
          <fieldset className="flex flex-wrap gap-3"><legend className="text-xs">{t('允许自动同步的数据源','Sources allowed to sync automatically')}</legend>{sources.map(item=><label key={item} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={sourceDraft.includes(item)} onChange={e=>setSourceDraft(current=>e.target.checked?[...current,item]:current.filter(source=>source!==item))}/>{item}</label>)}</fieldset>
          <button className={button} disabled={busy||!sourceDraft.length}>{t('保存来源','Save sources')}</button>
        </form>}
        {binding===device.id&&<form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();void run(async()=>{await request('/'+device.id+'/scopes','POST',{source,sessionId:session,originId:origin});setBinding('');setSession('');setOrigin('');});}}>
          <select aria-label={t('来源','Source')} className={input} value={source} onChange={e=>setSource(e.target.value)}>{device.allowedSources.map(item=><option key={item}>{item}</option>)}</select>
          <input aria-label="Session ID" className={input} value={session} onChange={e=>setSession(e.target.value)} required maxLength={512}/>
          <input aria-label="Origin ID" className={input} value={origin} onChange={e=>setOrigin(e.target.value)} required maxLength={512}/>
          <button className={button} disabled={busy}>{t('确认绑定','Confirm binding')}</button>
        </form>}
      </div>)}
    </>}
    {reviews&&<div data-testid="sync-review-list" className="space-y-2 rounded-lg border border-[var(--color-border)] p-3 text-xs">
      <p className="font-medium">{t('历史冲突审阅','Historical review queue')}</p>
      {reviews.length===0?<p>{t('当前没有待审阅的同步冲突。','No sync conflicts are waiting for review.')}</p>:reviews.map(review=><div key={review.id} className="space-y-1 border-t border-[var(--color-border)] pt-2 first:border-0 first:pt-0">
        <p>{review.source} · {review.sessionSummary} · {review.code}</p>
        <p>{new Date(review.createdAt).toLocaleString(language==='zh'?'zh-CN':'en-US')}</p>
        <p>{review.oldDataRetained?t('旧数据仍然可见，未被静默删除。','The previous visible data remains retained.') : t('当前没有上一有效版本。','No previous visible version is available.')}</p>
        <p>{t('下一步：先修正来源证据，再由 Owner 通过维护流程审阅；不要删除或重置本地 outbox。','Next: correct the source evidence, then have the Owner review it through the maintenance flow. Do not delete or reset the local outbox.')}</p>
      </div>)}
    </div>}
    {secret&&<div role="status" className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
      <p className="text-xs">{t('凭据仅在本次操作后显示。请存入设备安全存储。','This token is shown once. Save it in secure device storage.')}</p>
      <code className="break-all select-all text-xs">{secret}</code><button className={button} onClick={()=>setSecret(null)}>{t('关闭凭据','Dismiss token')}</button>
    </div>}
  </section>;
}
