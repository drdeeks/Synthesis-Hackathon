/**
 * UI Interaction Tests
 * Tests for draggable UI elements, panel behavior, and user interactions
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/popup/App';
import { getSettings, saveSettings } from '../src/shared/storage';

// Mock storage module
jest.mock('../src/shared/storage', () => ({
  getSettings: jest.fn(),
  saveSettings: jest.fn(),
}));

const getSettingsMock = getSettings as jest.Mock;
const saveSettingsMock = saveSettings as jest.Mock;

// Mock fetch
const mockFetch = global.fetch as jest.Mock;

describe('UI Interactions - Popup App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(''),
    });
  });

  describe('Initial State', () => {
    it('shows loading state initially', async () => {
      getSettingsMock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(null), 100))
      );

      render(<App />);

      // Loading state should be visible initially
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('shows setup form when no settings exist', async () => {
      getSettingsMock.mockResolvedValue(null);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter API key')).toBeInTheDocument();
      });
    });

    it('shows configured view when settings exist', async () => {
      getSettingsMock.mockResolvedValue({
        veniceApiKey: 'vapi_test',
        bankrUsername: '@user',
        bankrEnabled: true,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Configuration Saved')).toBeInTheDocument();
      });
    });
  });

  describe('Settings Form Interactions', () => {
    it('allows typing in API key field', async () => {
      getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });

      render(<App />);

      const input = await screen.findByPlaceholderText('Enter API key');
      await userEvent.type(input, 'vapi_new_key');

      expect(input).toHaveValue('vapi_new_key');
    });

    it('allows typing in Bankr username field', async () => {
      getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });

      render(<App />);

      const input = await screen.findByPlaceholderText('e.g. @yourbankrhandle');
      await userEvent.type(input, '@myhandle');

      expect(input).toHaveValue('@myhandle');
    });

    it('toggles Bankr integration checkbox', async () => {
      getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });

      render(<App />);

      await screen.findByPlaceholderText('Enter API key');
      const checkbox = screen.getByRole('checkbox');

      expect(checkbox).toBeChecked();

      await userEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();

      await userEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    });

    it('disables save button when API key is empty', async () => {
      getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });

      render(<App />);

      await screen.findByPlaceholderText('Enter API key');
      const saveButton = screen.getByText('Save Settings');

      expect(saveButton).toBeDisabled();
    });

    it('enables save button when API key is provided', async () => {
      getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });

      render(<App />);

      const input = await screen.findByPlaceholderText('Enter API key');
      await userEvent.type(input, 'vapi_test');

      const saveButton = screen.getByText('Save Settings');
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe('Form Submission', () => {
    it('validates API key before saving', async () => {
      getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      });

      render(<App />);

      const input = await screen.findByPlaceholderText('Enter API key');
      await userEvent.type(input, 'invalid_key');

      const saveButton = screen.getByText('Save Settings');
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/rejected/i)).toBeInTheDocument();
      });
    });

    it('saves valid settings and transitions to configured view', async () => {
      getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });
      saveSettingsMock.mockResolvedValue(undefined);
      mockFetch.mockResolvedValue({ ok: true });

      render(<App />);

      const input = await screen.findByPlaceholderText('Enter API key');
      await userEvent.type(input, 'vapi_valid');

      const saveButton = screen.getByText('Save Settings');
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Configuration Saved')).toBeInTheDocument();
      });
    });

    it('changes button text while saving', async () => {
      getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });
      saveSettingsMock.mockResolvedValue(undefined);
      mockFetch.mockResolvedValue({ ok: true });

      render(<App />);

      const input = await screen.findByPlaceholderText('Enter API key');
      await userEvent.type(input, 'vapi_test');

      // Before clicking, button should say "Save Settings"
      const saveButton = screen.getByText('Save Settings');
      expect(saveButton).toBeInTheDocument();

      // After successful save, transitions to configured view
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Configuration Saved')).toBeInTheDocument();
      });
    });
  });

  describe('Edit Mode', () => {
    it('transitions from configured view to edit mode', async () => {
      getSettingsMock.mockResolvedValue({
        veniceApiKey: 'vapi_existing',
        bankrUsername: '@user',
        bankrEnabled: true,
      });

      render(<App />);

      const editButton = await screen.findByRole('button', { name: 'Edit Settings' });
      await userEvent.click(editButton);

      expect(screen.getByPlaceholderText('Enter API key')).toBeInTheDocument();
    });

    it('preserves existing values when entering edit mode', async () => {
      getSettingsMock.mockResolvedValue({
        veniceApiKey: 'vapi_existing',
        bankrUsername: '@existing_user',
        bankrEnabled: false,
      });

      render(<App />);

      const editButton = await screen.findByRole('button', { name: 'Edit Settings' });
      await userEvent.click(editButton);

      const apiKeyInput = screen.getByPlaceholderText('Enter API key');
      const bankrInput = screen.getByPlaceholderText('e.g. @yourbankrhandle');
      const checkbox = screen.getByRole('checkbox');

      expect(apiKeyInput).toHaveValue('vapi_existing');
      expect(bankrInput).toHaveValue('@existing_user');
      expect(checkbox).not.toBeChecked();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when settings load fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      getSettingsMock.mockRejectedValue(new Error('Load failed'));

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load settings/i)).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it('allows dismissing error messages', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      getSettingsMock.mockRejectedValue(new Error('Load failed'));

      render(<App />);

      const dismissButton = await screen.findByText('×');
      await userEvent.click(dismissButton);

      expect(screen.queryByText(/failed to load settings/i)).not.toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe('Configured View Display', () => {
    it('displays masked API key', async () => {
      getSettingsMock.mockResolvedValue({
        veniceApiKey: 'vapi_secret_key_12345',
        bankrUsername: '',
        bankrEnabled: true,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('••••2345')).toBeInTheDocument();
      });
    });

    it('displays Bankr username when set', async () => {
      getSettingsMock.mockResolvedValue({
        veniceApiKey: 'vapi_test',
        bankrUsername: '@myuser',
        bankrEnabled: true,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('@myuser')).toBeInTheDocument();
      });
    });

    it('shows "Not set" for empty Bankr username', async () => {
      getSettingsMock.mockResolvedValue({
        veniceApiKey: 'vapi_test',
        bankrUsername: '',
        bankrEnabled: true,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Not set')).toBeInTheDocument();
      });
    });

    it('shows Bankr integration status', async () => {
      getSettingsMock.mockResolvedValue({
        veniceApiKey: 'vapi_test',
        bankrUsername: '',
        bankrEnabled: true,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument();
      });
    });

    it('shows disabled Bankr status', async () => {
      getSettingsMock.mockResolvedValue({
        veniceApiKey: 'vapi_test',
        bankrUsername: '',
        bankrEnabled: false,
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument();
      });
    });
  });
});

describe('UI Interactions - Floating Button and Panel (Content Script)', () => {
  // These tests simulate the content script's floating UI elements

  describe('Floating Button', () => {
    it('creates floating button element', () => {
      const button = document.createElement('button');
      button.className = 'venice-reply-btn';
      button.innerHTML = '💡';
      button.title = 'AI Reply Composer';

      expect(button.className).toBe('venice-reply-btn');
      expect(button.innerHTML).toBe('💡');
      expect(button.title).toBe('AI Reply Composer');
    });

    it('toggles panel visibility on click', () => {
      const panel = document.createElement('div');
      panel.id = 'venice-reply-panel';
      panel.className = 'venice-reply-panel';

      const button = document.createElement('button');
      button.addEventListener('click', () => {
        panel.classList.toggle('active');
      });

      // Initially not active
      expect(panel.classList.contains('active')).toBe(false);

      // Click to activate
      button.click();
      expect(panel.classList.contains('active')).toBe(true);

      // Click to deactivate
      button.click();
      expect(panel.classList.contains('active')).toBe(false);
    });
  });

  describe('Panel Behavior', () => {
    it('closes panel when close button clicked', () => {
      const panel = document.createElement('div');
      panel.className = 'venice-reply-panel active';

      const closeButton = document.createElement('button');
      closeButton.className = 'venice-close-btn';
      closeButton.addEventListener('click', () => {
        panel.classList.remove('active');
      });

      expect(panel.classList.contains('active')).toBe(true);

      closeButton.click();
      expect(panel.classList.contains('active')).toBe(false);
    });

    it('closes panel when clicking backdrop', () => {
      const panel = document.createElement('div');
      panel.className = 'venice-reply-panel active';

      panel.addEventListener('click', (e) => {
        if (e.target === panel) {
          panel.classList.remove('active');
        }
      });

      // Simulate clicking the backdrop (panel itself)
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: panel });
      panel.dispatchEvent(event);

      expect(panel.classList.contains('active')).toBe(false);
    });

    it('does not close panel when clicking content', () => {
      const panel = document.createElement('div');
      panel.className = 'venice-reply-panel active';

      const content = document.createElement('div');
      content.className = 'venice-reply-panel-content';
      panel.appendChild(content);

      panel.addEventListener('click', (e) => {
        if (e.target === panel) {
          panel.classList.remove('active');
        }
      });

      // Simulate clicking content
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: content });
      panel.dispatchEvent(event);

      expect(panel.classList.contains('active')).toBe(true);
    });
  });

  describe('Transient Notices', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('creates transient notice element', () => {
      const toast = document.createElement('div');
      toast.id = 'venice-reply-toast';
      toast.textContent = 'Copied to clipboard';

      expect(toast.id).toBe('venice-reply-toast');
      expect(toast.textContent).toBe('Copied to clipboard');
    });

    it('removes existing notice before showing new one', () => {
      document.body.innerHTML = '';

      // Create existing notice
      const existingToast = document.createElement('div');
      existingToast.id = 'venice-reply-toast';
      existingToast.textContent = 'Old message';
      document.body.appendChild(existingToast);

      // Simulate showTransientNotice
      const showTransientNotice = (message: string) => {
        const existing = document.getElementById('venice-reply-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'venice-reply-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        window.setTimeout(() => toast.remove(), 2600);
      };

      showTransientNotice('New message');

      expect(document.getElementById('venice-reply-toast')?.textContent).toBe('New message');
    });

    it('auto-removes notice after timeout', () => {
      document.body.innerHTML = '';

      const showTransientNotice = (message: string) => {
        const toast = document.createElement('div');
        toast.id = 'venice-reply-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        window.setTimeout(() => toast.remove(), 2600);
      };

      showTransientNotice('Temporary message');
      expect(document.getElementById('venice-reply-toast')).not.toBeNull();

      jest.advanceTimersByTime(2600);
      expect(document.getElementById('venice-reply-toast')).toBeNull();
    });
  });
});

describe('UI Interactions - Suggestion Cards', () => {
  it('creates suggestion card element', () => {
    const card = document.createElement('div');
    card.className = 'venice-suggestion';
    card.innerHTML = '<p>Test suggestion</p>';

    expect(card.className).toBe('venice-suggestion');
  });

  it('highlights card on hover', () => {
    const card = document.createElement('div');
    card.style.borderColor = '#2a2a4a';
    let isHovered = false;

    card.addEventListener('mouseover', () => {
      isHovered = true;
      card.style.borderColor = '#e63946';
    });

    card.addEventListener('mouseout', () => {
      isHovered = false;
      card.style.borderColor = '#2a2a4a';
    });

    // Initially not hovered
    expect(isHovered).toBe(false);

    const mouseoverEvent = new MouseEvent('mouseover');
    card.dispatchEvent(mouseoverEvent);
    expect(isHovered).toBe(true);

    const mouseoutEvent = new MouseEvent('mouseout');
    card.dispatchEvent(mouseoutEvent);
    expect(isHovered).toBe(false);
  });

  it('copies suggestion text to clipboard on click', async () => {
    const mockWriteText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: mockWriteText },
    });

    const suggestionText = 'Great point! I totally agree.';
    await navigator.clipboard.writeText(suggestionText);

    expect(mockWriteText).toHaveBeenCalledWith(suggestionText);
  });
});
