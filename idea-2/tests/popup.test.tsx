import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/popup/App';
import { getSettings, saveSettings } from '../src/shared/storage';

jest.mock('../src/shared/storage', () => ({
  getSettings: jest.fn(),
  saveSettings: jest.fn(),
}));

const getSettingsMock = getSettings as jest.Mock;
const saveSettingsMock = saveSettings as jest.Mock;
const fetchMock = global.fetch as jest.Mock;

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('')
    });
  });

  it('renders without crashing', async () => {
    getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });
    render(<App />);
    expect(screen.getByText('Venice Reply Composer')).toBeInTheDocument();
  });

  it('shows configured view when settings already saved', async () => {
    getSettingsMock.mockResolvedValue({
      veniceApiKey: 'test-key',
      bankrUsername: '@bankr-user',
      bankrEnabled: true,
    });
    render(<App />);
    await screen.findByText('Configuration Saved');
    expect(screen.getByText('@bankr-user')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Settings' })).toBeInTheDocument();
  });

  it('handles settings save', async () => {
    getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });
    saveSettingsMock.mockResolvedValue(undefined);
    render(<App />);

    await screen.findByPlaceholderText('Enter API key');
    const input = screen.getByPlaceholderText('Enter API key');
    const bankrInput = screen.getByPlaceholderText('e.g. @yourbankrhandle');
    const button = screen.getByText('Save Settings');

    fireEvent.change(input, { target: { value: 'new-key' } });
    fireEvent.change(bankrInput, { target: { value: '@deek' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(saveSettingsMock).toHaveBeenCalledWith({
        veniceApiKey: 'new-key',
        bankrUsername: '@deek',
        bankrEnabled: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Configuration Saved')).toBeInTheDocument();
    });
  });

  it('disables save button when API key empty', async () => {
    getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });
    render(<App />);
    await screen.findByPlaceholderText('Enter API key');
    const button = screen.getByText('Save Settings');
    expect(button).toBeDisabled();
  });

  it('enables save button when API key provided', async () => {
    getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });
    render(<App />);
    await screen.findByPlaceholderText('Enter API key');
    const input = screen.getByPlaceholderText('Enter API key');
    fireEvent.change(input, { target: { value: 'new-key' } });
    const button = screen.getByText('Save Settings');
    expect(button).not.toBeDisabled();
  });

  it('shows warning when API key missing', async () => {
    getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });
    render(<App />);
    await screen.findByText(/enter your venice api key/i);
  });

  it('lets user return to setup mode from configured view', async () => {
    getSettingsMock.mockResolvedValue({ veniceApiKey: 'test-key', bankrUsername: '', bankrEnabled: true });
    render(<App />);

    const editButton = await screen.findByRole('button', { name: 'Edit Settings' });
    fireEvent.click(editButton);

    expect(screen.getByPlaceholderText('Enter API key')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. @yourbankrhandle')).toBeInTheDocument();
  });

  it('normalizes Bearer style API keys before saving', async () => {
    getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });
    saveSettingsMock.mockResolvedValue(undefined);
    render(<App />);

    await screen.findByPlaceholderText('Enter API key');
    const input = screen.getByPlaceholderText('Enter API key');
    const button = screen.getByText('Save Settings');

    fireEvent.change(input, { target: { value: 'Bearer vapi_example123' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(saveSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({ veniceApiKey: 'vapi_example123' })
      );
    });
  });

  it('shows validation error and skips save when Venice rejects key', async () => {
    getSettingsMock.mockResolvedValue({ veniceApiKey: '', bankrUsername: '', bankrEnabled: true });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('Unauthorized')
    });

    render(<App />);
    await screen.findByPlaceholderText('Enter API key');
    const input = screen.getByPlaceholderText('Enter API key');
    const button = screen.getByText('Save Settings');

    fireEvent.change(input, { target: { value: 'bad-key' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(saveSettingsMock).not.toHaveBeenCalled();
      expect(screen.getByText(/venice rejected this key/i)).toBeInTheDocument();
    });
  });
});
