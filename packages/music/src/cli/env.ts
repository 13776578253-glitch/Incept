// 环境文件加载：路径由根转发脚本显式传入（--env-file），包内不再自读 apps/web/.env.local
// 文件缺失不报错，与原脚本行为一致
export function loadEnvironment(envFile: string): void {
  if (envFile === '') return;

  try {
    process.loadEnvFile(envFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw error;
    }
  }
}
