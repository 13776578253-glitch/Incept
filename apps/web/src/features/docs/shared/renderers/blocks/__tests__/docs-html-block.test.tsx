import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DocsHtmlBlock } from '../docs-html-block';

afterEach(cleanup);

describe('DocsHtmlBlock', () => {
  it('renders a minimal frameless sandboxed iframe without allow-same-origin or extra controls', () => {
    const rawHtml = '<!doctype html><html><body><canvas id="gl"></canvas></body></html>';
    render(
      <DocsHtmlBlock
        id="html-demo"
        type="html"
        title="Three.js Cube"
        height={2400}
        caption="Interactive wireframe cube"
        html={rawHtml}
      />,
    );

    const iframe = screen.getByTitle('Three.js Cube') as HTMLIFrameElement;
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe.getAttribute('srcdoc')).toBe(rawHtml);
    expect(iframe.style.height).toBe('1200px');
    expect(screen.getByText('Interactive wireframe cube')).toBeTruthy();
    expect(document.querySelectorAll('button')).toHaveLength(0);
  });

  it('clamps small heights up to 120px and omits figcaption when absent', () => {
    render(
      <DocsHtmlBlock
        id="html-compact"
        type="html"
        height={40}
        html="<p>Compact scene</p>"
      />,
    );

    const iframe = screen.getByTitle('Interactive HTML embed') as HTMLIFrameElement;
    expect(iframe.style.height).toBe('120px');
    expect(document.querySelector('figcaption')).toBeNull();
  });
});
