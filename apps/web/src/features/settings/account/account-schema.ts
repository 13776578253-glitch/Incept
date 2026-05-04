import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsGroup } from '../shared/settings-types';

export function getAccountSettingsGroup(locale: AppLocale): SettingsGroup {
  if (locale === 'zh') {
    return {
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
    };
  }

  return {
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
  };
}
