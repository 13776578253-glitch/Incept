import type { AppLocale } from '@/i18n/config/locales';
import type {
  MockSectionIntro,
  MockSettingsAnchor,
  MockSettingsGroup,
} from '@/lib/mock/shared/mock-types';
import { getSettingsSidebarMock } from '@/lib/mock/pages/settings/settings-sidebar.mock';
import { getSettingsGroupsMock } from '@/lib/mock/pages/settings/settings-sections.mock';

function getSettingsPageIntroMock(locale: AppLocale): MockSectionIntro {
  if (locale === 'zh') {
    return {
      eyebrow: 'Settings',
      title: '连续展开的设置页，而不是切来切去的控制台',
      description:
        '这一版把设置界面定义成独立的双栏结构。左侧只是目录锚点，右侧是一整篇连续展开的设置内容，用来先验证层级、节奏和未来扩展位。',
    };
  }

  return {
    eyebrow: 'Settings',
    title: 'A continuous settings page instead of a panel-switching console',
    description:
      'This pass treats settings as an independent two-column page. The left side is only an anchor directory, while the right side stays as one continuous surface for structure, rhythm, and future extension slots.',
  };
}

function orderSidebarByGroups(
  sidebar: MockSettingsAnchor[],
  groups: MockSettingsGroup[],
) {
  const anchorOrder = groups.flatMap((group) =>
    group.domains.map((domain) => domain.anchorId),
  );

  return [...sidebar].sort((left, right) => {
    const leftIndex = anchorOrder.indexOf(left.id);
    const rightIndex = anchorOrder.indexOf(right.id);

    if (leftIndex === -1 && rightIndex === -1) {
      return 0;
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
}

export function getSettingsPageMock(locale: AppLocale) {
  const groups = getSettingsGroupsMock(locale);

  return {
    intro: getSettingsPageIntroMock(locale),
    sidebar: orderSidebarByGroups(getSettingsSidebarMock(locale), groups),
    groups,
  };
}
