import type {ReactNode} from 'react';
import {cleanup,render} from '@testing-library/react';
import {NextIntlClientProvider} from 'next-intl';
import {afterEach,expect,it,vi} from 'vitest';
import zh from '../../../../messages/zh/docs.json';
import type {DocsLibraryEntryModel} from '../types';
import {DocsLibraryTable} from '../components/docs-library-table';

vi.mock('next/link',()=>({default:(props:{href:string;children:ReactNode})=><a href={props.href}>{props.children}</a>}));

afterEach(cleanup);

const entry:DocsLibraryEntryModel={
  documentId:1,locale:'zh',title:'设计模式（一）',slug:'design-patterns-overview',
  routeType:'collectionArticle',kind:'article',layoutMode:'sidebar',accessRole:'private',
  collectionTitle:'设计模式',collectionSlug:'design-patterns',position:1,
  finalRoute:'/zh/docs/design-patterns/design-patterns-overview',
  createdAt:'2026-10-20T00:00:00.000Z',updatedAt:'2026-10-23T00:00:00.000Z'
};

function renderTable(entries:DocsLibraryEntryModel[]){
  return render(<NextIntlClientProvider locale="zh" messages={{docs:zh}}><DocsLibraryTable entries={entries}/></NextIntlClientProvider>);
}

function cells(){return Array.from(document.querySelectorAll('tbody tr td')).map(td=>td.textContent);}

it('merges route type and kind into one plain Type column',()=>{
  renderTable([entry]);
  const headers=Array.from(document.querySelectorAll('thead th')).map(th=>th.textContent);
  expect(headers).toEqual(['标题','类型','访问权限','当前合集','当前位置','最近更新','操作']);
  expect(cells()).toHaveLength(7);
  expect(cells()[1]).toBe('合集文章');
  // 去掉了彩色徽章：类型单元格里不再有圆角胶囊
  expect(document.querySelector('tbody tr td:nth-child(2) .rounded-full')).toBeNull();
});

it('appends the kind only when it is not a plain article',()=>{
  renderTable([{...entry,kind:'note'}]);
  expect(cells()[1]).toBe('合集文章 · note');
});
