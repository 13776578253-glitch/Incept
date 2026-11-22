import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button, ProgressMeter, SegmentedControl, Select, SettingsGroup, SettingsRow, Switch, UnderlineTabs } from '../primitives';

describe('@incept/ui primitives', () => {
  it('renders Switch pill variant by default and respects fieldset disabled', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <Switch checked={false} onCheckedChange={onCheckedChange} ariaLabel="Toggle item" stateLabel="Off" />,
    );

    const toggle = screen.getByRole('switch', { name: 'Toggle item' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveTextContent('Off');
    await user.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    rerender(
      <fieldset disabled>
        <Switch checked onCheckedChange={onCheckedChange} ariaLabel="Toggle item" stateLabel="On" />
      </fieldset>,
    );
    expect(screen.getByRole('switch', { name: 'Toggle item' })).toBeDisabled();
  });

  it('supports toggle Switch variant with native semantics', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Switch variant="toggle" checked onCheckedChange={onCheckedChange} ariaLabel="Classic toggle" stateLabel="On" />,
    );

    const toggle = screen.getByRole('switch', { name: 'Classic toggle' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('opens Base UI Select and updates selection', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Select
        value="sans"
        ariaLabel="Font family"
        onValueChange={onValueChange}
        options={[
          { value: 'system', label: 'System' },
          { value: 'sans', label: 'Modern Sans' },
          { value: 'serif', label: 'Editorial Serif' },
        ]}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Font family' });
    await user.click(trigger);
    const option = await screen.findByRole('option', { name: 'Editorial Serif' });
    await user.click(option);
    expect(onValueChange).toHaveBeenCalledWith('serif');
  });

  it('renders SegmentedControl, Button, SettingsGroup, and ProgressMeter', async () => {
    const onSelect = vi.fn();
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <div>
        <SettingsGroup title="Section">
          <SettingsRow
            title="Mode"
            control={
              <SegmentedControl
                ariaLabel="Contrast"
                value="default"
                onValueChange={onSelect}
                options={[
                  { id: 'default', label: 'Default' },
                  { id: 'strong', label: 'Strong' },
                ]}
              />
            }
          />
        </SettingsGroup>
        <Button variant="primary" onClick={onClick}>
          Save
        </Button>
        <ProgressMeter
          title="Quota"
          segments={[
            { id: 'a', label: 'Standalone', value: 40, max: 100, valueText: '40%' },
            { id: 'b', label: 'Collection', value: 120, max: 100, valueText: '100%' },
          ]}
        />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Strong' }));
    expect(onSelect).toHaveBeenCalledWith('strong');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute('aria-valuenow', '40');
    expect(bars[1]).toHaveAttribute('aria-valuenow', '100');
  });

  it('renders UnderlineTabs, marks aria-selected, and calls onValueChange', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <UnderlineTabs
        ariaLabel="Account tabs"
        value="grants"
        onValueChange={onValueChange}
        items={[
          { id: 'grants', label: 'Pro 授权', count: 3 },
          { id: 'security', label: '安全设置' },
        ]}
      />,
    );

    const grantsTab = screen.getByRole('tab', { name: /Pro 授权/ });
    const securityTab = screen.getByRole('tab', { name: '安全设置' });
    expect(grantsTab).toHaveAttribute('aria-selected', 'true');
    expect(securityTab).toHaveAttribute('aria-selected', 'false');

    await user.click(securityTab);
    expect(onValueChange).toHaveBeenCalledWith('security');
  });
});
