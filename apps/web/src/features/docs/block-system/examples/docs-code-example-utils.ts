// TODO: 规划
// 目标：把这个文件从“示例代码字符串整理工具”升级为“示例代码构建入口”。
// 当前阶段只做了两件事：
// 1. dedentCode：去掉多行模板字符串的公共缩进
// 2. buildCodeExample：把 line[] 拼回稳定代码字符串
//
// 后续计划分三步：
// 1. 按代码类型拆 helper，而不是所有语言共用同一个 builder
//    - buildCommandExample(lines) -> bash / cli
//    - buildJsonExample(value) -> JSON.stringify(value, null, 2)
//    - buildHtmlExample(lines)
//    - buildCssExample(lines)
//    - buildTsExample(lines)
//    这样 style-lab、seed、未来 create preview 都不再直接手写大段 code 字符串。
//
// 2. 给 builder 增加统一入参，建立真正的“代码示例工厂”
//    例如：
//    buildCodeExample({
//      language: 'typescript',
//      lines: [...],
//      mode: 'multiline' | 'command' | 'long-line',
//      normalize: true,
//    })
//    这样未来就能在 create 和 AI 输出里共用同一条构建链。
//
// 3. 在这个文件附近增加“语法高亮前置层”
//    推荐方向：
//    - 不自己手写大量 regex
//    - 优先接现成 highlighter（例如 Shiki）
//    - 这个文件负责输出稳定 rawCode
//    - 新增 highlight helper 负责把 rawCode -> highlighted tokens / html
//    - DocsCodeBlock 只负责渲染和 copy，不负责语言识别
//
// 第一版目标语言：
// - txt
// - bash / shell / cli
// - html
// - css
// - javascript / typescript
// - python
// - c / cpp
// - go
// - sql
//
// 设计边界：
// - 这里先管“示例代码如何生成得更干净”
// - 不在这个文件里直接写 React UI
// - 不在这个文件里做 copy、theme、scrollbar
// - 未来高亮层接进来时，也保持“内容构建”和“UI 显示”分离

export function dedentCode(source: string): string {
  const normalized = source.replace(/\r\n/g, '\n');
  const trimmed = normalized.replace(/^\n+|\n+$/g, '');

  const lines = trimmed.split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^ */)?.[0].length ?? 0);

  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;

  return lines.map((line) => line.slice(minIndent)).join('\n');
}

export function buildCodeExample(lines: string[]): string {
  return dedentCode(lines.join('\n'));
}
