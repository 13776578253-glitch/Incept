export { musicCatalogGet as GET } from '@/server/music/assembly';

// force-dynamic 语义配置：留在路由文件静态可析
// history: runtime='nodejs' 是 Next 16 默认值，已随路由工厂收编移除
export const dynamic = 'force-dynamic';
