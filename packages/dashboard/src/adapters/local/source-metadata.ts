import 'server-only';
import type { SourceDescriptionKey } from '../../domain/index';

export const SOURCE_META: Array<{
  sourceId: SourceDescriptionKey;
  label: string;
  descriptionKey: SourceDescriptionKey;
}> = [
    { sourceId: 'commandcode', label: 'CommandCode', descriptionKey: 'commandcode' },
    { sourceId: 'codex', label: 'Codex CLI', descriptionKey: 'codex' },
    { sourceId: 'antigravity', label: 'Antigravity', descriptionKey: 'antigravity' },
    { sourceId: 'claudeCode', label: 'Claude Code', descriptionKey: 'claudeCode' },
    { sourceId: 'opencode', label: 'OpenCode', descriptionKey: 'opencode' },
    { sourceId: 'zcode', label: 'ZCode', descriptionKey: 'zcode' },
    { sourceId: 'geminiCli', label: 'Gemini CLI', descriptionKey: 'geminiCli' },
    { sourceId: 'deepseekHarness', label: 'DeepSeek Harness', descriptionKey: 'deepseekHarness' },
  ];
