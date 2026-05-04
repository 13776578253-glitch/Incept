import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsGroup } from '../shared/settings-types';

export function getAiSettingsGroup(locale: AppLocale): SettingsGroup {
  if (locale === 'zh') {
    return {
      id: 'model-settings',
      title: '模型',
      description: '模型密钥与能力预留。',
      domains: [
        {
          id: 'ai',
          anchorId: 'ai',
          label: 'AI',
          description: '为 workspace 里的模型调用与私有能力接入做准备。',
          visibility: 'admin',
          defaultExpanded: false,
          rows: [
            {
              id: 'ai-provider-key',
              label: 'AI Key',
              description: '后续这里会管理模型服务密钥与默认来源。',
              controlType: 'input',
              state: 'locked',
              visibility: 'admin',
              placeholder: 'sk-••••••••••••',
              actionLabel: '保存',
              badge: 'Locked',
            },
            {
              id: 'ai-default-provider',
              label: '默认提供方',
              description: '为后续多模型或多服务接入预留。',
              controlType: 'select',
              state: 'locked',
              visibility: 'admin',
              value: '尚未配置',
            },
            {
              id: 'ai-workspace-note',
              label: 'Workspace 能力',
              description: '未来会把这里的配置同步给 workspace 中的 AI 工具使用。',
              controlType: 'status',
              state: 'locked',
              visibility: 'admin',
              value: '等待接入',
            },
          ],
        },
      ],
    };
  }

  return {
    id: 'model-settings',
    title: 'Model',
    description: 'Model keys and capability placeholders.',
    domains: [
      {
        id: 'ai',
        anchorId: 'ai',
        label: 'AI',
        description:
          'Prepare for model access and private capability wiring inside workspace.',
        visibility: 'admin',
        defaultExpanded: false,
        rows: [
          {
            id: 'ai-provider-key',
            label: 'AI key',
            description:
              'Model-service keys and default source wiring will live here later.',
            controlType: 'input',
            state: 'locked',
            visibility: 'admin',
            placeholder: 'sk-••••••••••••',
            actionLabel: 'Save',
            badge: 'Locked',
          },
          {
            id: 'ai-default-provider',
            label: 'Default provider',
            description:
              'Reserved for future multi-provider and multi-model support.',
            controlType: 'select',
            state: 'locked',
            visibility: 'admin',
            value: 'Not configured',
          },
          {
            id: 'ai-workspace-note',
            label: 'Workspace capability',
            description:
              'This configuration will later feed AI tools inside the workspace.',
            controlType: 'status',
            state: 'locked',
            visibility: 'admin',
            value: 'Pending integration',
          },
        ],
      },
    ],
  };
}
