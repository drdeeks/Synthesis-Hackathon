import { render, screen, fireEvent, act } from '@testing-library/react';
import Settings from '../src/popup/components/Settings';

describe('Settings', () => {
  const onSave = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders settings form', () => {
    render(<Settings apiKey="" onSave={onSave} />);

    expect(screen.getByPlaceholderText(/Enter.*API key/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
    expect(screen.getByText(/Bankr Configuration/i)).toBeInTheDocument();
  });

  it('shows initial API key', () => {
    render(<Settings apiKey="test-key" onSave={onSave} />);

    expect(screen.getByDisplayValue('test-key')).toBeInTheDocument();
  });

  it('calls onSave when save button is clicked', () => {
    render(<Settings apiKey="" onSave={onSave} />);

    const input = screen.getByPlaceholderText(/Enter.*API key/i);
    const button = screen.getByRole('button', { name: /Save/i });

    fireEvent.change(input, { target: { value: 'new-key' } });
    fireEvent.click(button);

    expect(onSave).toHaveBeenCalledWith('new-key');
  });

  it('shows saved state and resets back to Save text', () => {
    jest.useFakeTimers();
    render(<Settings apiKey="" onSave={onSave} />);

    const button = screen.getByRole('button', { name: /Save/i });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: /Saved!/i })).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: /^Save$/i })).toBeInTheDocument();
    jest.useRealTimers();
  });
});
