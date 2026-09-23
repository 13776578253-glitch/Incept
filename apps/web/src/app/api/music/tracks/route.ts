export { musicCatalogGet as GET } from '@/server/music/assembly';

// force-dynamic 是语义配置、须留在路由文件静态可析；runtime='nodejs' 是文档默认值，随收编移除
export const dynamic = 'force-dynamic';
