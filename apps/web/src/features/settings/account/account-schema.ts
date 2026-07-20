import type { AppLocale } from '@/i18n/config/locales';
import type { SettingsSection } from '../shared/settings-types';

export function getAccountSettingsSection(locale: AppLocale): SettingsSection {
  if (locale === 'zh') {
    return {
      id: 'account',
      label: '账户',
      description: '身份与管理员入口',
      visibility: 'admin',
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
    };
  }

  return {
    id: 'account',
    label: 'Account',
    description: 'Identity and administrator access.',
    visibility: 'admin',
    rows: [
      {
        id: 'account-session',
        label: 'Current status',
        description: 'Settings are viewed as a visitor until administrator access is verified.',
        controlType: 'status',
        state: 'collapsed-preview',
        visibility: 'admin',
        value: 'Visitor',
      },
      {
        id: 'account-admin-key',
        label: 'Administrator verification',
        description: 'A single-administrator verification entry will be connected here later.',
        controlType: 'input',
        state: 'locked',
        visibility: 'admin',
        placeholder: 'Enter administrator key',
        actionLabel: 'Verify',
        badge: 'Locked',
      },
      {
        id: 'account-future',
        label: 'Identity model',
        description: 'Reserves room for future account models.',
        controlType: 'status',
        state: 'locked',
        visibility: 'admin',
        value: 'Single administrator reserved',
      },
    ],
  };
}
