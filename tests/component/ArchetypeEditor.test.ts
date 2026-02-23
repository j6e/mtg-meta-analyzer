// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ArchetypeEditor from '../../src/lib/components/ArchetypeEditor.svelte';
import {
	savedConfigs,
	activeConfigId,
	BUILTIN_CONFIG_ID,
	builtinArchetypeYaml,
} from '../../src/lib/stores/archetype-configs';

afterEach(() => cleanup());
beforeEach(() => {
	savedConfigs.set([]);
	activeConfigId.set(BUILTIN_CONFIG_ID);
});

describe('ArchetypeEditor component', () => {
	it('renders with built-in YAML in textarea', () => {
		const { container } = render(ArchetypeEditor);
		const textarea = container.querySelector('textarea');
		expect(textarea).toBeTruthy();
		expect(textarea!.value).toBe(builtinArchetypeYaml);
	});

	it('shows config dropdown with built-in option', () => {
		const { container } = render(ArchetypeEditor);
		const select = container.querySelector('select');
		expect(select).toBeTruthy();
		const options = select!.querySelectorAll('option');
		expect(options.length).toBeGreaterThanOrEqual(1);
		expect(options[0].value).toBe(BUILTIN_CONFIG_ID);
		expect(options[0].textContent).toContain('Built-in');
	});

	it('shows active badge when built-in is active', () => {
		const { container } = render(ArchetypeEditor);
		const badge = container.querySelector('.active-badge');
		expect(badge).toBeTruthy();
		expect(badge!.textContent).toContain('Active');
	});

	it('check button shows validation result', async () => {
		const { container, getByText } = render(ArchetypeEditor);
		const checkBtn = getByText('Check');
		await fireEvent.click(checkBtn);
		const validation = container.querySelector('.validation');
		expect(validation).toBeTruthy();
		expect(validation!.textContent).toContain('archetypes');
	});

	it('disables update and delete for built-in config', () => {
		const { getByText } = render(ArchetypeEditor);
		const updateBtn = getByText('Update') as HTMLButtonElement;
		const deleteBtn = getByText('Delete') as HTMLButtonElement;
		expect(updateBtn.disabled).toBe(true);
		expect(deleteBtn.disabled).toBe(true);
	});

	it('save as flow creates a config', async () => {
		const { container, getByText, getByPlaceholderText } = render(ArchetypeEditor);
		// Open save form
		await fireEvent.click(getByText('Save As…'));
		const nameInput = getByPlaceholderText('My Custom Config');
		expect(nameInput).toBeTruthy();

		// Fill in name and save
		await fireEvent.input(nameInput, { target: { value: 'Test Config' } });
		// Find the Save button inside the save form
		const saveBtn = container.querySelector('.save-form .btn-accent') as HTMLButtonElement;
		await fireEvent.click(saveBtn);

		const configs = get(savedConfigs);
		expect(configs).toHaveLength(1);
		expect(configs[0].name).toBe('Test Config');
	});
});
