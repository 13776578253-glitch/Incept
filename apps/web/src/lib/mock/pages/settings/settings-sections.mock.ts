import type { AppLocale } from '@/i18n/config/locales';
import type { MockSettingsGroup } from '@/lib/mock/shared/mock-types';

export function getSettingsGroupsMock(locale: AppLocale): MockSettingsGroup[] {
  if (locale === 'zh') {
    return [
      {
        id: 'basic-settings',
        title: '基础设置',
        description: '先处理所有访客都能直接理解和使用的基础偏好。',
        domains: [
          {
            id: 'appearance',
            anchorId: 'appearance',
            label: '主题',
            description: '控制当前站点的整体观感与阅读明暗。',
            visibility: 'public',
            defaultExpanded: true,
            rows: [
              {
                id: 'appearance-theme',
                label: '主题模式',
                description: '在亮色、暗色与跟随系统之间切换。',
                controlType: 'theme-segmented',
                state: 'interactive',
                visibility: 'public',
              },
              {
                id: 'appearance-reading-filter',
                label: '护眼滤镜',
                description: '未来会加入更温和的夜间阅读滤镜与色温选项。',
                controlType: 'select',
                state: 'locked',
                visibility: 'public',
                value: '即将加入',
                badge: 'Locked',
              },
            ],
          },
          {
            id: 'language',
            anchorId: 'language',
            label: '语言',
            description: '管理界面语言，并为后续语音语言预留位置。',
            visibility: 'public',
            defaultExpanded: true,
            rows: [
              {
                id: 'language-locale',
                label: '界面语言',
                description: '切换当前界面的主要显示语言。',
                controlType: 'language-segmented',
                state: 'interactive',
                visibility: 'public',
                options: [
                  { id: 'zh', label: '简体中文' },
                  { id: 'en', label: 'English' },
                ],
              },
              {
                id: 'language-voice',
                label: '语音语言',
                description: '为后续 TTS 与朗读场景预留的语言设置入口。',
                controlType: 'select',
                state: 'locked',
                visibility: 'public',
                value: '稍后开放',
                badge: 'Locked',
              },
              {
                id: 'language-extra',
                label: '扩展语言',
                description: '后续预留日语等更多界面语言扩展。',
                controlType: 'status',
                state: 'locked',
                visibility: 'public',
                value: '保留中',
              },
            ],
          },
        ],
      },
      {
        id: 'account-settings',
        title: '账户',
        description: '身份与管理员入口。',
        domains: [
          {
            id: 'account',
            anchorId: 'account',
            label: '账户',
            description: '当前版本只有单管理员方向，但结构上为未来扩展保留空间。',
            visibility: 'admin',
            defaultExpanded: false,
            rows: [
              {
                id: 'account-session',
                label: '当前状态',
                description: '未验证时以访客身份浏览设置页。',
                controlType: 'status',
                state: 'collapsed-preview',
                visibility: 'admin',
                value: '访客',
              },
              {
                id: 'account-admin-key',
                label: '管理员验证',
                description: '后续会接入单管理员 key 验证入口。',
                controlType: 'input',
                state: 'locked',
                visibility: 'admin',
                placeholder: '输入管理员 key',
                actionLabel: '验证',
                badge: 'Locked',
              },
              {
                id: 'account-future',
                label: '身份模型',
                description: '保留未来扩展成更多账户形态的结构空间。',
                controlType: 'status',
                state: 'locked',
                visibility: 'admin',
                value: '单管理员预留',
              },
            ],
          },
        ],
      },
      {
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
      },
    ];
  }

  return [
    {
      id: 'basic-settings',
      title: 'Basic Settings',
      description:
        'Start with the preferences every visitor can understand and use immediately.',
      domains: [
        {
          id: 'appearance',
          anchorId: 'appearance',
          label: 'Appearance',
          description: 'Control the overall look and reading contrast of the site.',
          visibility: 'public',
          defaultExpanded: true,
          rows: [
            {
              id: 'appearance-theme',
              label: 'Theme mode',
              description:
                'Switch between light, dark, and system-following modes.',
              controlType: 'theme-segmented',
              state: 'interactive',
              visibility: 'public',
            },
            {
              id: 'appearance-reading-filter',
              label: 'Eye-comfort filter',
              description:
                'A softer night-reading filter and color temperature options will live here later.',
              controlType: 'select',
              state: 'locked',
              visibility: 'public',
              value: 'Coming later',
              badge: 'Locked',
            },
          ],
        },
        {
          id: 'language',
          anchorId: 'language',
          label: 'Language',
          description:
            'Manage interface language and reserve room for future voice language settings.',
          visibility: 'public',
          defaultExpanded: true,
          rows: [
            {
              id: 'language-locale',
              label: 'Interface language',
              description:
                'Switch the primary language used across the current interface.',
              controlType: 'language-segmented',
              state: 'interactive',
              visibility: 'public',
              options: [
                { id: 'zh', label: 'Simplified Chinese' },
                { id: 'en', label: 'English' },
              ],
            },
            {
              id: 'language-voice',
              label: 'Voice language',
              description:
                'Reserved for later TTS and read-aloud language settings.',
              controlType: 'select',
              state: 'locked',
              visibility: 'public',
              value: 'Not yet available',
              badge: 'Locked',
            },
            {
              id: 'language-extra',
              label: 'Extra languages',
              description: 'Reserve space for later additions such as Japanese.',
              controlType: 'status',
              state: 'locked',
              visibility: 'public',
              value: 'Reserved',
            },
          ],
        },
      ],
    },
    {
      id: 'account-settings',
      title: 'Account',
      description: 'Identity and admin access.',
      domains: [
        {
          id: 'account',
          anchorId: 'account',
          label: 'Account',
          description:
            'The current version stays single-owner oriented while preserving future extension space.',
          visibility: 'admin',
          defaultExpanded: false,
          rows: [
            {
              id: 'account-session',
              label: 'Current state',
              description:
                'When not verified, the settings page is viewed in a visitor state.',
              controlType: 'status',
              state: 'collapsed-preview',
              visibility: 'admin',
              value: 'Visitor',
            },
            {
              id: 'account-admin-key',
              label: 'Admin verification',
              description:
                'A single-owner admin key entry will be connected here later.',
              controlType: 'input',
              state: 'locked',
              visibility: 'admin',
              placeholder: 'Enter admin key',
              actionLabel: 'Verify',
              badge: 'Locked',
            },
            {
              id: 'account-future',
              label: 'Identity model',
              description:
                'Reserve structural space for a broader account model later.',
              controlType: 'status',
              state: 'locked',
              visibility: 'admin',
              value: 'Single-owner reserved',
            },
          ],
        },
      ],
    },
    {
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
    },
  ];
}
