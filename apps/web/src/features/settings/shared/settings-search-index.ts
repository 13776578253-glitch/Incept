export const SETTINGS_NAVIGATE_EVENT = 'incept:settings-navigate';

export type SettingsNavigateDetail = {
  sectionId: string;
  tabId?: string;
  anchorId?: string;
};

export type SettingsSearchItem = {
  id: string;
  sectionId: string;
  tabId?: string;
  anchorId?: string;
  title: { zh: string; en: string };
  sectionLabel: { zh: string; en: string };
  keywords: readonly string[];
  ownerOnly?: boolean;
  guestOrProOnly?: boolean;
};

export const SETTINGS_SEARCH_ITEMS: readonly SettingsSearchItem[] = [
  // Appearance
  {
    id: 'appearance-preset',
    sectionId: 'appearance',
    anchorId: 'appearance-preset',
    title: { zh: '主题预设', en: 'Color scheme' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['default', 'warm paper', 'latte', 'mocha', 'rose pine', 'dawn', '配色', '默认', '暖纸', '主题'],
  },
  {
    id: 'appearance-mode',
    sectionId: 'appearance',
    anchorId: 'appearance-mode',
    title: { zh: '明暗模式', en: 'Theme mode' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['light', 'dark', 'system', 'polarity', '亮色', '暗色', '跟随系统', '夜间模式'],
  },
  {
    id: 'appearance-accent',
    sectionId: 'appearance',
    anchorId: 'appearance-accent',
    title: { zh: '强调色', en: 'Accent color' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['highlight', 'accent', 'neutral', 'mist blue', 'cobalt', 'dusty rose', 'sage', 'amber', '雾蓝', '靛蓝', '尘玫', '鼠尾草', '琥珀'],
  },
  {
    id: 'appearance-accent-contrast',
    sectionId: 'appearance',
    anchorId: 'appearance-accent-contrast',
    title: { zh: '强调色对比度', en: 'Accent contrast' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['accent', 'contrast', 'soft', 'muted', 'strong', '强调色对比度', '弱化', '强调色', '增强'],
  },
  {
    id: 'appearance-contrast',
    sectionId: 'appearance',
    anchorId: 'appearance-contrast',
    title: { zh: '界面对比度', en: 'Contrast' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['strong', 'default', 'contrast', '增强', '对比'],
  },
  {
    id: 'appearance-font',
    sectionId: 'appearance',
    anchorId: 'appearance-font',
    title: { zh: '界面字体', en: 'Font' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['font', 'typography', 'sans', 'serif', 'kai', 'mono', 'geometric', 'humanist', '字体', '楷体', '等宽', '衬线'],
  },
  {
    id: 'appearance-font-size',
    sectionId: 'appearance',
    anchorId: 'appearance-font-size',
    title: { zh: '全局字号', en: 'Font size' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['11px', '12px', '13px', '14px', '15px', '16px', 'font size', '字号', '字体大小'],
  },
  {
    id: 'appearance-docs-font',
    sectionId: 'appearance',
    anchorId: 'appearance-docs-font',
    title: { zh: '文档字体', en: 'Docs font' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['docs', 'reading', 'typography', 'serif', 'kai', 'sans', '文档字体', '阅读字体'],
  },
  {
    id: 'appearance-docs-font-size',
    sectionId: 'appearance',
    anchorId: 'appearance-docs-font-size',
    title: { zh: '文档字号', en: 'Docs font size' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['12px', '13px', '14px', '15px', '16px', '17px', '18px', 'docs font size', '文档字号', '正文字号'],
  },
  {
    id: 'appearance-docs-line-height',
    sectionId: 'appearance',
    anchorId: 'appearance-docs-line-height',
    title: { zh: '文档行距', en: 'Docs line height' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['line height', 'spacing', 'compact', 'comfortable', 'relaxed', '行距', '紧凑', '适中', '舒展'],
  },
  {
    id: 'appearance-docs-image-scale',
    sectionId: 'appearance',
    anchorId: 'appearance-docs-image-scale',
    title: { zh: '文档图片缩放', en: 'Docs image scale' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['image', 'scale', 'zoom', 'diagram', 'width', '图片缩放', '图片', '流程图', '缩放', '90%', '80%'],
  },
  {
    id: 'appearance-code-palette',
    sectionId: 'appearance',
    anchorId: 'appearance-code-palette',
    title: { zh: '代码块配色', en: 'Code palette' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['code', 'syntax', 'shiki', 'preview', '代码', '语法高亮', '预览'],
  },
  {
    id: 'appearance-docs-inline-code-accent',
    sectionId: 'appearance',
    anchorId: 'appearance-docs-inline-code-accent',
    title: { zh: '行内代码强调色', en: 'Inline code accent' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['inline code', 'pill', 'accent', '行内代码', '行内代码强调色', '强调色'],
  },
  {
    id: 'appearance-docs-code-accent',
    sectionId: 'appearance',
    anchorId: 'appearance-docs-code-accent',
    title: { zh: '代码块强调色', en: 'Code accent' },
    sectionLabel: { zh: '外观', en: 'Appearance' },
    keywords: ['code accent', 'highlight', '代码块强调色', '强调色'],
  },

  // Language
  {
    id: 'language-ui',
    sectionId: 'language',
    anchorId: 'language-ui',
    title: { zh: '界面语言', en: 'Interface language' },
    sectionLabel: { zh: '语言', en: 'Language' },
    keywords: ['locale', 'zh', 'en', 'chinese', 'english', '中文', '英文', '简体中文'],
  },
  {
    id: 'language-docs',
    sectionId: 'language',
    anchorId: 'language-docs',
    title: { zh: '文档语言', en: 'Document language' },
    sectionLabel: { zh: '语言', en: 'Language' },
    keywords: ['reading language', 'docs', '文档', '阅读语言'],
  },

  // Dashboard
  {
    id: 'dashboard-palette',
    sectionId: 'dashboard',
    anchorId: 'dashboard-color-mode',
    title: { zh: '图表色彩风格（亮色 / 暗色）', en: 'Chart palette style (Light / Dark)' },
    sectionLabel: { zh: '仪表盘', en: 'Dashboard' },
    keywords: ['dashboard', 'chart', 'palette', 'vivid', 'pastel', 'light', 'dark', '仪表盘', '图表', '配色', '亮色', '暗色', '清透活力', '柔和粉彩'],
  },
  {
    id: 'dashboard-family-colors',
    sectionId: 'dashboard',
    anchorId: 'dashboard-family-colors',
    title: { zh: '模型家族色系', en: 'Model family hues' },
    sectionLabel: { zh: '仪表盘', en: 'Dashboard' },
    keywords: ['deepseek', 'gemini', 'gpt', 'claude', 'family', 'color', 'light', 'dark', '模型家族', '配色', '亮色', '暗色'],
  },
  {
    id: 'dashboard-pinned-models',
    sectionId: 'dashboard',
    anchorId: 'dashboard-pinned-models',
    title: { zh: '固化展示模型与单模型配色', en: 'Pinned & recolored models' },
    sectionLabel: { zh: '仪表盘', en: 'Dashboard' },
    keywords: ['pin', 'pinned', 'model', 'hero', '固化模型', '固定模型', '单模型配色'],
  },
  {
    id: 'dashboard-import',
    sectionId: 'dashboard',
    anchorId: 'dashboard-import',
    title: { zh: '跨机器数据导入', en: 'Cross-device import' },
    sectionLabel: { zh: '仪表盘', en: 'Dashboard' },
    keywords: ['import', 'backup', 'json', 'rollback', 'cross-device', '导入', '跨机器', '回退'],
    ownerOnly: true,
  },

  // Music
  {
    id: 'music-player-enabled',
    sectionId: 'music',
    tabId: 'preferences',
    anchorId: 'music-player-enabled',
    title: { zh: '启用音乐播放器', en: 'Music player' },
    sectionLabel: { zh: '音乐 · 播放器偏好', en: 'Music · Player' },
    keywords: ['player', 'audio', 'floating', '悬浮播放器', '音乐开关'],
  },
  {
    id: 'music-rate-lock',
    sectionId: 'music',
    tabId: 'preferences',
    anchorId: 'music-rate-lock',
    title: { zh: '倍速锁定', en: 'Playback rate lock' },
    sectionLabel: { zh: '音乐 · 播放器偏好', en: 'Music · Player' },
    keywords: ['speed', 'rate', '1x', '0.5x', '2x', '倍速', '锁定'],
  },
  {
    id: 'music-placement',
    sectionId: 'music',
    tabId: 'preferences',
    anchorId: 'music-placement',
    title: { zh: '记住悬浮位置', en: 'Remember placement' },
    sectionLabel: { zh: '音乐 · 播放器偏好', en: 'Music · Player' },
    keywords: ['dock', 'position', 'snap', '位置', '吸附'],
  },
  {
    id: 'music-playback-mode',
    sectionId: 'music',
    tabId: 'preferences',
    anchorId: 'music-playback-mode',
    title: { zh: '播放顺序', en: 'Playback order' },
    sectionLabel: { zh: '音乐 · 播放器偏好', en: 'Music · Player' },
    keywords: ['shuffle', 'repeat', 'loop', 'order', '单曲', '顺序', '循环', '随机'],
  },
  {
    id: 'music-upload',
    sectionId: 'music',
    tabId: 'library',
    anchorId: 'music-upload',
    title: { zh: '上传音频', en: 'Upload audio' },
    sectionLabel: { zh: '音乐 · 曲库与曲目', en: 'Music · Library & Tracks' },
    keywords: ['upload', 'mp3', 'wav', 'flac', 'ncm', 'folder', '上传', '导入音频'],
    ownerOnly: true,
  },
  {
    id: 'music-libraries',
    sectionId: 'music',
    tabId: 'library',
    anchorId: 'music-libraries',
    title: { zh: '曲库管理', en: 'Libraries' },
    sectionLabel: { zh: '音乐 · 曲库与曲目', en: 'Music · Library & Tracks' },
    keywords: ['library', 'libraries', 'playlist', '曲库', '新建曲库', '歌单'],
    ownerOnly: true,
  },
  {
    id: 'music-tracks',
    sectionId: 'music',
    tabId: 'library',
    anchorId: 'music-tracks',
    title: { zh: '曲目列表', en: 'Tracks' },
    sectionLabel: { zh: '音乐 · 曲库与曲目', en: 'Music · Library & Tracks' },
    keywords: ['tracks', 'songs', 'artist', '曲目', '歌曲', '作者', '时长'],
    ownerOnly: true,
  },

  // Account
  {
    id: 'account-pro-code',
    sectionId: 'account',
    anchorId: 'account-pro-code',
    title: { zh: 'Pro 访问码', en: 'Pro access code' },
    sectionLabel: { zh: '账户', en: 'Account' },
    keywords: ['pro', 'redeem', 'code', '共享访问码', '兑换', '启用访问'],
    guestOrProOnly: true,
  },
  {
    id: 'account-owner-login',
    sectionId: 'account',
    anchorId: 'account-owner-login',
    title: { zh: 'Owner 登录', en: 'Owner sign in' },
    sectionLabel: { zh: '账户', en: 'Account' },
    keywords: ['owner', 'login', 'sign in', 'admin', '登录', '管理员'],
    guestOrProOnly: true,
  },
  {
    id: 'account-grants',
    sectionId: 'account',
    tabId: 'grants',
    anchorId: 'account-grants',
    title: { zh: 'Pro 授权', en: 'Pro access grants' },
    sectionLabel: { zh: '账户 · Pro 授权', en: 'Account · Pro access' },
    keywords: ['grant', 'invitation', 'sharing', 'code', '授权码', '单次邀请', '范围分享', '授权记录'],
    ownerOnly: true,
  },
  {
    id: 'account-sec-password',
    sectionId: 'account',
    tabId: 'security',
    anchorId: 'account-sec-password',
    title: { zh: '修改密码', en: 'Change password' },
    sectionLabel: { zh: '账户 · 安全设置', en: 'Account · Security' },
    keywords: ['password', '改密', '密码', '安全'],
    ownerOnly: true,
  },
  {
    id: 'account-sec-totp',
    sectionId: 'account',
    tabId: 'security',
    anchorId: 'account-sec-totp',
    title: { zh: '验证器与恢复码', en: 'Authenticator & recovery codes' },
    sectionLabel: { zh: '账户 · 安全设置', en: 'Account · Security' },
    keywords: ['totp', '2fa', 'authenticator', 'recovery', '动态码', '验证器', '恢复码'],
    ownerOnly: true,
  },
  {
    id: 'account-sec-sessions',
    sectionId: 'account',
    tabId: 'security',
    anchorId: 'account-sec-sessions',
    title: { zh: '登录会话与可信设备', en: 'Sessions & trusted devices' },
    sectionLabel: { zh: '账户 · 安全设置', en: 'Account · Security' },
    keywords: ['session', 'trusted device', 'logout', '会话', '可信设备', '退出'],
    ownerOnly: true,
  },
  {
    id: 'account-sec-approval',
    sectionId: 'account',
    tabId: 'security',
    anchorId: 'account-sec-approval',
    title: { zh: '批准新设备登录', en: 'Approve new device sign-in' },
    sectionLabel: { zh: '账户 · 安全设置', en: 'Account · Security' },
    keywords: ['permit', 'challenge', 'approval', '一次性授权码', '批准'],
    ownerOnly: true,
  },
  {
    id: 'account-sec-audits',
    sectionId: 'account',
    tabId: 'security',
    anchorId: 'account-sec-audits',
    title: { zh: '安全操作记录', en: 'Security activity' },
    sectionLabel: { zh: '账户 · 安全设置', en: 'Account · Security' },
    keywords: ['audit', 'activity', 'log', '审计', '安全记录', '操作记录'],
    ownerOnly: true,
  },
  {
    id: 'account-devices',
    sectionId: 'account',
    tabId: 'devices',
    anchorId: 'account-devices',
    title: { zh: 'Token 同步设备', en: 'Token sync devices' },
    sectionLabel: { zh: '账户 · 同步设备', en: 'Account · Sync devices' },
    keywords: ['sync', 'token', 'cli', 'device', 'review', 'outbox', '同步设备', '历史冲突'],
    ownerOnly: true,
  },

  // Docs
  {
    id: 'docs-overview',
    sectionId: 'docs',
    anchorId: 'docs-overview',
    title: { zh: '文档总览', en: 'Docs overview' },
    sectionLabel: { zh: '文档', en: 'Docs' },
    keywords: ['stats', 'overview', 'collections', '文档', '全库概览', '合集', '统计'],
    ownerOnly: true,
  },
  {
    id: 'docs-curation',
    sectionId: 'docs',
    anchorId: 'docs-curation',
    title: { zh: '首页精选白名单', en: 'Docs Home curated whitelist' },
    sectionLabel: { zh: '文档', en: 'Docs' },
    keywords: ['curated', 'whitelist', 'featured', 'docs home', '精选', '白名单', '首页展示', '筛选'],
    ownerOnly: true,
  },
  {
    id: 'docs-table',
    sectionId: 'docs',
    anchorId: 'docs-table',
    title: { zh: '已发布文档列表', en: 'Published docs entries' },
    sectionLabel: { zh: '文档', en: 'Docs' },
    keywords: ['articles', 'routes', 'slug', 'role', '文档列表', '路由', '权限'],
    ownerOnly: true,
  },

  // Projects
  {
    id: 'projects-create',
    sectionId: 'projects',
    anchorId: 'projects-create',
    title: { zh: '新建项目', en: 'Create project' },
    sectionLabel: { zh: '项目与功能', en: 'Projects & surfaces' },
    keywords: ['create project', 'new project', '新建', '创建项目'],
    ownerOnly: true,
  },
  {
    id: 'projects-list',
    sectionId: 'projects',
    anchorId: 'projects-list',
    title: { zh: '项目与功能开关', en: 'Project surface toggles' },
    sectionLabel: { zh: '项目与功能', en: 'Projects & surfaces' },
    keywords: ['roadmap', 'atlas', 'planning board', 'surface', '路线图', '规划图', '功能开关', '删除项目'],
    ownerOnly: true,
  },
];

export function searchSettingsItems(
  query: string,
  locale: 'zh' | 'en',
  viewerRole: 'guest' | 'pro' | 'owner',
): SettingsSearchItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);

  return SETTINGS_SEARCH_ITEMS.filter((item) => {
    if (item.ownerOnly && viewerRole !== 'owner') {
      return false;
    }
    if (item.guestOrProOnly && viewerRole === 'owner') {
      return false;
    }

    const haystack = [
      item.title.zh,
      item.title.en,
      item.sectionLabel.zh,
      item.sectionLabel.en,
      item.sectionId,
      ...item.keywords,
    ]
      .join(' ')
      .toLowerCase();

    return tokens.every((token) => haystack.includes(token));
  }).sort((a, b) => {
    const titleA = a.title[locale].toLowerCase().includes(normalized) ? 0 : 1;
    const titleB = b.title[locale].toLowerCase().includes(normalized) ? 0 : 1;
    return titleA - titleB;
  });
}

export function dispatchSettingsNavigate(detail: SettingsNavigateDetail) {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent<SettingsNavigateDetail>(SETTINGS_NAVIGATE_EVENT, { detail }));
}
