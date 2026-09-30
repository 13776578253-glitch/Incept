import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectSurfacesPanel } from '../project-surfaces-panel';

const mockProjects = [
  {
    key: 'project-one',
    name: { en: 'Project One', zh: '项目一' },
    roadmapEnabled: true,
    atlasEnabled: true,
  },
  {
    key: 'project-two',
    name: { en: 'Project Two', zh: '项目二' },
    roadmapEnabled: true,
    atlasEnabled: false,
  },
];

describe('ProjectSurfacesPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders project list with keys, names and surface toggles', () => {
    render(<ProjectSurfacesPanel initialProjects={mockProjects} language="zh" />);

    expect(screen.getByRole('heading', { name: '项目与功能' })).toBeInTheDocument();
    expect(screen.getByText('2 个项目')).toBeInTheDocument();

    expect(screen.getByText('project-one')).toBeInTheDocument();
    expect(screen.getByText('project-two')).toBeInTheDocument();

    const zhInputs = screen.getAllByPlaceholderText('例如：项目一');
    expect(zhInputs).toHaveLength(2);
    expect(zhInputs[0]).toHaveValue('项目一');
    expect(zhInputs[1]).toHaveValue('项目二');
  });

  it('allows toggling surfaces and prevents turning off both surfaces', async () => {
    const user = userEvent.setup();
    render(<ProjectSurfacesPanel initialProjects={mockProjects} language="zh" />);

    // In project-two, roadmap is enabled, atlas is disabled
    // Trying to turn off roadmap (the only enabled surface) should be disabled
    const toggles = screen.getAllByRole('switch');
    // project-one has 2 switches (roadmap, atlas), project-two has 2 switches (roadmap, atlas)
    expect(toggles).toHaveLength(4);

    const projectTwoRoadmapToggle = toggles[2];
    expect(projectTwoRoadmapToggle).toBeDisabled();

    // In project-one, both are enabled. Let's toggle atlas off.
    const projectOneAtlasToggle = toggles[1];
    expect(projectOneAtlasToggle).not.toBeDisabled();
    await user.click(projectOneAtlasToggle);

    // Now atlas is disabled in project-one, so roadmap should become disabled (cannot disable last)
    const projectOneRoadmapToggle = toggles[0];
    expect(projectOneRoadmapToggle).toBeDisabled();
  });

  it('handles save action correctly', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const user = userEvent.setup();
    render(<ProjectSurfacesPanel initialProjects={mockProjects} language="zh" />);

    const saveButtons = screen.getAllByRole('button', { name: '保存' });
    await user.click(saveButtons[0]);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/internal/roadmap/projects/project-one',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('已保存项目设置。')).toBeInTheDocument();
    });
  });

  it('requires two-step confirmation to delete a project', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const user = userEvent.setup();
    render(<ProjectSurfacesPanel initialProjects={mockProjects} language="zh" />);

    const deleteButtons = screen.getAllByRole('button', { name: '删除项目' });
    // First click asks for confirmation
    await user.click(deleteButtons[0]);
    expect(screen.getByRole('button', { name: '确认删除？' })).toBeInTheDocument();

    // Second click executes delete
    await user.click(screen.getByRole('button', { name: '确认删除？' }));

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/internal/roadmap/projects/project-one',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('项目已删除。')).toBeInTheDocument();
      expect(screen.queryByText('project-one')).not.toBeInTheDocument();
    });
  });

  it('supports creating a new project', async () => {
    const newProject = {
      key: 'project-three',
      name: { en: 'Project Three', zh: '项目三' },
      roadmapEnabled: true,
      atlasEnabled: true,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project: newProject }),
    } as Response);

    const user = userEvent.setup();
    render(<ProjectSurfacesPanel initialProjects={mockProjects} language="zh" />);

    const nameInput = screen.getByPlaceholderText('例如：新项目');
    await user.type(nameInput, '项目三');

    // Single-field form: no separate key input
    expect(screen.queryByPlaceholderText('my-project')).not.toBeInTheDocument();

    const createButton = screen.getByRole('button', { name: '创建项目' });
    await user.click(createButton);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/internal/roadmap/projects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          key: 'project-three',
          name: { en: 'Project Three', zh: '项目三' },
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('项目已创建。')).toBeInTheDocument();
      expect(screen.getByText('project-three')).toBeInTheDocument();
    });
  });
});
