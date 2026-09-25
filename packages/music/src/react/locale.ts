// MusicLocale 精确镜像宿主 AppLocale 联合（类型边界契约）：
// 函数参数逆变要求 AppLocale ⊆ MusicLocale，贡献 label 才能赋给宿主 `(locale: AppLocale) => string` 签名
export type MusicLocale = 'en' | 'zh';
