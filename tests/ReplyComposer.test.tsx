import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReplyComposer from '../src/popup/components/ReplyComposer';

const mockCreateCompletion = jest.fn().mockResolvedValue({
  choices: [{ message: { content: 'Mocked reply 1\n\nMocked reply 2' } }],
});

// Mock the OpenAI module
jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreateCompletion,
      },
    },
  })),
}));

describe('ReplyComposer', () => {
  const mockApiKey = 'test-venice-key';
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('renders input and button', () => {
    render(<ReplyComposer apiKey={mockApiKey} />);
    expect(screen.getByPlaceholderText(/Paste social media post here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate/i })).toBeInTheDocument();
  });

  it('shows alert when apiKey is empty', async () => {
    render(<ReplyComposer apiKey="" />);
    const input = screen.getByPlaceholderText(/Paste social media post here/i);
    fireEvent.change(input, { target: { value: 'This post has enough text' } });
    const button = screen.getByRole('button', { name: /Generate/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Please enter your Venice API key in Settings');
    });
  });

  it('shows alert when input is too short', async () => {
    render(<ReplyComposer apiKey={mockApiKey} />);
    const input = screen.getByPlaceholderText(/Paste social media post here/i);
    fireEvent.change(input, { target: { value: 'hi' } });
    const button = screen.getByRole('button', { name: /Generate/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Please enter at least 5 characters of text');
    });
  });

  it('fetches suggestions successfully', async () => {
    render(<ReplyComposer apiKey={mockApiKey} />);
    const input = screen.getByPlaceholderText(/Paste social media post here/i);
    fireEvent.change(input, { target: { value: 'This is a test post for generating replies' } });
    const button = screen.getByRole('button', { name: /Generate/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    });
  });
});
