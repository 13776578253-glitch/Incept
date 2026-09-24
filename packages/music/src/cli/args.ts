// 三入口共享的参数骨架：--env-file / --mirror 由根转发脚本显式传入（决策 13：路径知识留宿主侧）
// --help 与未知参数的出口行为保留在各入口的 parseArgs，用法文案与参数逐字保留
export type MusicCliCommonArgs = {
  envFile: string;
  mirror: string;
};

export function parseCommonArgs(argv: string[]): { common: MusicCliCommonArgs; rest: string[] } {
  const common: MusicCliCommonArgs = { envFile: '', mirror: '' };
  const rest: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--env-file') {
      common.envFile = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (current === '--mirror') {
      common.mirror = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    rest.push(current);
  }

  return { common, rest };
}

export function exitWithUsage(printUsage: () => void): never {
  printUsage();
  process.exit(0);
}

export function failUnknownArgument(current: string, printUsage: () => void): never {
  console.error(`Unknown argument: ${current}`);
  printUsage();
  process.exit(1);
}
