import { render, screen, fireEvent } from '@testing-library/react';
import ReplySuggestion from '../src/popup/components/ReplySuggestion';

describe('ReplySuggestion Component', () => {
  const mockOnClick = jest.fn();

  const defaultSuggestion = {
    text: 'This is a test reply suggestion',
    confidence: 0.85,
    tokens: 7,
    bankrTokens: ['BTC', 'ETH'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders suggestion text', () => {
    render(
      <ReplySuggestion
        suggestion={defaultSuggestion}
        onClick={mockOnClick}
        isSelected={false}
      />
    );

    expect(screen.getByText('This is a test reply suggestion')).toBeInTheDocument();
  });

  it('displays confidence percentage', () => {
    render(
      <ReplySuggestion
        suggestion={defaultSuggestion}
        onClick={mockOnClick}
        isSelected={false}
      />
    );

    expect(screen.getByText('85% confidence')).toBeInTheDocument();
  });

  it('displays token count', () => {
    render(
      <ReplySuggestion
        suggestion={defaultSuggestion}
        onClick={mockOnClick}
        isSelected={false}
      />
    );

    expect(screen.getByText('7 tokens')).toBeInTheDocument();
  });

  it('displays bankr token badges when present', () => {
    render(
      <ReplySuggestion
        suggestion={defaultSuggestion}
        onClick={mockOnClick}
        isSelected={false}
      />
    );

    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('ETH')).toBeInTheDocument();
  });

  it('does not display bankr badges when bankrTokens is empty', () => {
    const suggestionNoTokens = {
      ...defaultSuggestion,
      bankrTokens: [],
    };

    render(
      <ReplySuggestion
        suggestion={suggestionNoTokens}
        onClick={mockOnClick}
        isSelected={false}
      />
    );

    expect(screen.queryByText('BTC')).not.toBeInTheDocument();
  });

  it('does not display bankr badges when bankrTokens is undefined', () => {
    const suggestionUndefinedTokens = {
      text: 'No tokens here',
      confidence: 0.75,
      tokens: 3,
    };

    render(
      <ReplySuggestion
        suggestion={suggestionUndefinedTokens}
        onClick={mockOnClick}
        isSelected={false}
      />
    );

    // Should render without crashing
    expect(screen.getByText('No tokens here')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    render(
      <ReplySuggestion
        suggestion={defaultSuggestion}
        onClick={mockOnClick}
        isSelected={false}
      />
    );

    const card = screen.getByText('This is a test reply suggestion').closest('.suggestion-card');
    if (card) {
      fireEvent.click(card);
    }

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('applies selected class when isSelected is true', () => {
    render(
      <ReplySuggestion
        suggestion={defaultSuggestion}
        onClick={mockOnClick}
        isSelected={true}
      />
    );

    const card = screen.getByText('This is a test reply suggestion').closest('.suggestion-card');
    expect(card).toHaveClass('selected');
  });

  it('does not apply selected class when isSelected is false', () => {
    render(
      <ReplySuggestion
        suggestion={defaultSuggestion}
        onClick={mockOnClick}
        isSelected={false}
      />
    );

    const card = screen.getByText('This is a test reply suggestion').closest('.suggestion-card');
    expect(card).not.toHaveClass('selected');
  });

  it('applies hovered class on mouse enter', () => {
    render(
      <ReplySuggestion
        suggestion={defaultSuggestion}
        onClick={mockOnClick}
        isSelected={false}
      />
    );

    const card = screen.getByText('This is a test reply suggestion').closest('.suggestion-card');
    if (card) {
      fireEvent.mouseEnter(card);
    }

    expect(card).toHaveClass('hovered');
  });

  it('removes hovered class on mouse leave', () => {
    render(
      <ReplySuggestion
        suggestion={defaultSuggestion}
        onClick={mockOnClick}
        isSelected={false}
      />
    );

    const card = screen.getByText('This is a test reply suggestion').closest('.suggestion-card');
    if (card) {
      fireEvent.mouseEnter(card);
      fireEvent.mouseLeave(card);
    }

    expect(card).not.toHaveClass('hovered');
  });

  describe('Confidence Color Coding', () => {
    it('shows green color for high confidence (>0.8)', () => {
      const highConfidenceSuggestion = {
        ...defaultSuggestion,
        confidence: 0.95,
      };

      render(
        <ReplySuggestion
          suggestion={highConfidenceSuggestion}
          onClick={mockOnClick}
          isSelected={false}
        />
      );

      const confidenceElement = screen.getByText('95% confidence');
      expect(confidenceElement).toHaveStyle({ color: '#10b981' }); // green
    });

    it('shows amber color for medium confidence (0.6-0.8)', () => {
      const mediumConfidenceSuggestion = {
        ...defaultSuggestion,
        confidence: 0.7,
      };

      render(
        <ReplySuggestion
          suggestion={mediumConfidenceSuggestion}
          onClick={mockOnClick}
          isSelected={false}
        />
      );

      const confidenceElement = screen.getByText('70% confidence');
      expect(confidenceElement).toHaveStyle({ color: '#f59e0b' }); // amber
    });

    it('shows red color for low confidence (<0.6)', () => {
      const lowConfidenceSuggestion = {
        ...defaultSuggestion,
        confidence: 0.5,
      };

      render(
        <ReplySuggestion
          suggestion={lowConfidenceSuggestion}
          onClick={mockOnClick}
          isSelected={false}
        />
      );

      const confidenceElement = screen.getByText('50% confidence');
      expect(confidenceElement).toHaveStyle({ color: '#ef4444' }); // red
    });

    it('shows green at exactly 0.81 boundary', () => {
      const boundarySuggestion = {
        ...defaultSuggestion,
        confidence: 0.81,
      };

      render(
        <ReplySuggestion
          suggestion={boundarySuggestion}
          onClick={mockOnClick}
          isSelected={false}
        />
      );

      const confidenceElement = screen.getByText('81% confidence');
      expect(confidenceElement).toHaveStyle({ color: '#10b981' });
    });

    it('shows amber at exactly 0.61 boundary', () => {
      const boundarySuggestion = {
        ...defaultSuggestion,
        confidence: 0.61,
      };

      render(
        <ReplySuggestion
          suggestion={boundarySuggestion}
          onClick={mockOnClick}
          isSelected={false}
        />
      );

      const confidenceElement = screen.getByText('61% confidence');
      expect(confidenceElement).toHaveStyle({ color: '#f59e0b' });
    });
  });

  describe('Edge Cases', () => {
    it('handles very long suggestion text', () => {
      const longSuggestion = {
        text: 'A'.repeat(500),
        confidence: 0.75,
        tokens: 100,
      };

      render(
        <ReplySuggestion
          suggestion={longSuggestion}
          onClick={mockOnClick}
          isSelected={false}
        />
      );

      expect(screen.getByText('A'.repeat(500))).toBeInTheDocument();
    });

    it('handles zero tokens', () => {
      const zeroTokenSuggestion = {
        text: 'Empty suggestion',
        confidence: 0.5,
        tokens: 0,
      };

      render(
        <ReplySuggestion
          suggestion={zeroTokenSuggestion}
          onClick={mockOnClick}
          isSelected={false}
        />
      );

      expect(screen.getByText('0 tokens')).toBeInTheDocument();
    });

    it('handles confidence of exactly 0', () => {
      const zeroConfidenceSuggestion = {
        text: 'Zero confidence',
        confidence: 0,
        tokens: 3,
      };

      render(
        <ReplySuggestion
          suggestion={zeroConfidenceSuggestion}
          onClick={mockOnClick}
          isSelected={false}
        />
      );

      expect(screen.getByText('0% confidence')).toBeInTheDocument();
    });

    it('handles confidence of exactly 1', () => {
      const perfectConfidenceSuggestion = {
        text: 'Perfect confidence',
        confidence: 1,
        tokens: 3,
      };

      render(
        <ReplySuggestion
          suggestion={perfectConfidenceSuggestion}
          onClick={mockOnClick}
          isSelected={false}
        />
      );

      expect(screen.getByText('100% confidence')).toBeInTheDocument();
    });

    it('handles many bankr tokens', () => {
      const manyTokensSuggestion = {
        text: 'Multi token suggestion',
        confidence: 0.8,
        tokens: 5,
        bankrTokens: ['BTC', 'ETH', 'SOL', 'MATIC', 'UNI', 'AAVE'],
      };

      render(
        <ReplySuggestion
          suggestion={manyTokensSuggestion}
          onClick={mockOnClick}
          isSelected={false}
        />
      );

      expect(screen.getByText('BTC')).toBeInTheDocument();
      expect(screen.getByText('ETH')).toBeInTheDocument();
      expect(screen.getByText('SOL')).toBeInTheDocument();
      expect(screen.getByText('MATIC')).toBeInTheDocument();
      expect(screen.getByText('UNI')).toBeInTheDocument();
      expect(screen.getByText('AAVE')).toBeInTheDocument();
    });
  });
});
