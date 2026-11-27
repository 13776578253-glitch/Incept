import {StrictMode,type ReactNode} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NextIntlClientProvider} from 'next-intl';
import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import zh from '../../../../messages/zh/docs.json';
import navigation from '../../../../messages/zh/navigation.json';
import type {DocsLibraryEntryModel} from '../types';
import {DocsLibraryTable} from '../components/docs-library-table';

vi.mock('next/link',()=>({
  default:(props:{href:string;children:ReactNode})=><a href={props.href}>{props.children}</a>,
  useLinkStatus: () => ({ pending: false }),
}));

beforeAll(()=>{
  if(typeof HTMLDialogElement!=='undefined'){
    if(!HTMLDialogElement.prototype.showModal){
      HTMLDialogElement.prototype.showModal=function showModal(){
        this.setAttribute('open','');
      };
    }
    // Mirror the HTML spec where dialog.close() dispatches 'close' asynchronously.
    HTMLDialogElement.prototype.close=function close(){
      this.removeAttribute('open');
      queueMicrotask(()=>this.dispatchEvent(new Event('close')));
    };
  }
});

afterEach(cleanup);

const entry:DocsLibraryEntryModel={
  documentId:1,locale:'zh',title:'设计模式（一）',slug:'design-patterns-overview',
  routeType:'collectionArticle',kind:'article',layoutMode:'sidebar',accessRole:'private',
  collectionTitle:'设计模式',collectionSlug:'design-patterns',position:1,
  finalRoute:'/zh/docs/design-patterns/design-patterns-overview',
  createdAt:'2026-10-20T00:00:00.000Z',updatedAt:'2026-10-23T00:00:00.000Z'
};

function renderTable(entries:DocsLibraryEntryModel[]){
  return render(<StrictMode><NextIntlClientProvider locale="zh" messages={{docs:zh,navigation}}><DocsLibraryTable entries={entries}/></NextIntlClientProvider></StrictMode>);
}

function cells(){return Array.from(document.querySelectorAll('tbody tr td')).map(td=>td.textContent);}

it('merges route type and kind into one plain Type column with concise labels',()=>{
  renderTable([entry]);
  const headers=Array.from(document.querySelectorAll('thead th')).map(th=>th.textContent);
  expect(headers).toEqual(['标题','类型','访问权限','当前合集','当前位置','最近更新','操作']);
  expect(cells()).toHaveLength(7);
  expect(cells()[1]).toBe('合集');
  // 去掉了彩色徽章：类型单元格里不再有圆角胶囊
  expect(document.querySelector('tbody tr td:nth-child(2) .rounded-full')).toBeNull();
});

it('appends the kind only when it is not a plain article',()=>{
  renderTable([{...entry,kind:'note'}]);
  expect(cells()[1]).toBe('合集 · note');
});

it('renders the open route link without the copy route button',()=>{
  renderTable([entry]);
  const openLink=document.querySelector('a[href="/zh/docs/design-patterns/design-patterns-overview"]');
  expect(openLink?.textContent).toContain('打开路由');
  expect(document.body.textContent).not.toContain('复制路由');
});

it('paginates long entry lists across pages',()=>{
  const entries:DocsLibraryEntryModel[]=Array.from({length:10},(_,index)=>({
    ...entry,
    documentId:index+1,
    title:`Doc ${index+1}`,
    slug:`doc-${index+1}`,
    finalRoute:`/zh/docs/doc-${index+1}`,
  }));
  renderTable(entries);
  expect(document.querySelectorAll('tbody tr')).toHaveLength(8);
  expect(screen.getByText('1 / 2')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'下一页'}));
  expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
  expect(screen.getByText('2 / 2')).toBeTruthy();
});

it('edits document title and access role in a modal dialog without mutating table layout',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({
    ok:true,
    json:async()=>({
      ok:true,
      entry:{
        targetType:'document',
        documentId:1,
        locale:'zh',
        title:'设计模式（修订版）',
        accessRole:'guest',
        updatedAt:'2026-11-27T11:30:00.000Z',
      },
    }),
  });
  vi.stubGlobal('fetch',fetchMock);
  try{
    renderTable([entry]);
    fireEvent.click(screen.getByRole('button',{name:'编辑'}));
    // Flush async microtask close events from StrictMode effect cleanup.
    await new Promise((resolve)=>setTimeout(resolve,0));
    const titleInput=screen.getByLabelText('文档标题') as HTMLInputElement;
    expect(titleInput.value).toBe('设计模式（一）');
    fireEvent.change(titleInput,{target:{value:'设计模式（修订版）'}});
    fireEvent.click(screen.getByRole('radio',{name:'访客'}));
    fireEvent.click(screen.getByRole('button',{name:'保存'}));
    await screen.findByText('设计模式（修订版）');
    expect(fetchMock).toHaveBeenCalledWith('/api/internal/docs/metadata',expect.objectContaining({
      method:'PATCH',
      body:JSON.stringify({
        targetType:'document',
        targetId:1,
        locale:'zh',
        title:'设计模式（修订版）',
        accessRole:'guest',
      }),
    }));
    expect(cells()[2]).toBe('访客');
  }finally{
    vi.unstubAllGlobals();
  }
});
