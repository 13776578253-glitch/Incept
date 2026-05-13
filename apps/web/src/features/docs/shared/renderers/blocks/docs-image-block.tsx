import type { DocsImageBlockModel } from '@/features/docs/block-system';

// 图片块组件，根据提供的图片地址、替代文本和可选说明渲染独立图片内容，适用于文档中的插图、界面截图和视觉说明
export function DocsImageBlock({
  src,
  alt,
  caption,
}: DocsImageBlockModel) {
  return (
    <figure className="w-full max-w-[var(--docs-prose-max-width)]">
      <img
        src={src}
        alt={alt}
        className="block w-full rounded-[14px] border border-[color:color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[var(--color-bg)] object-cover"
      />
      {caption ? (
        <figcaption className="mt-3 text-[0.88rem] leading-6 text-[var(--color-text-soft)]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
