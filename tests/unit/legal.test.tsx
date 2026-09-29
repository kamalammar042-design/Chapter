import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiProcessing } from '@/features/landing/Legal';

describe('privacy policy: AI processing', () => {
  it('names the provider that is actually configured', () => {
    const { unmount } = render(<AiProcessing provider="groq" />);
    expect(screen.getByText(/sent to Groq, Inc\./)).toBeInTheDocument();
    expect(screen.getByText(/gpt-oss/)).toBeInTheDocument();
    unmount();
    render(<AiProcessing provider="openrouter" />);
    expect(screen.getByText(/through OpenRouter, Inc\. .* Claude/)).toBeInTheDocument();
  });

  it('says AI is off rather than naming a provider when none is configured', () => {
    render(<AiProcessing provider={null} />);
    expect(screen.getByText(/AI features are currently switched off/)).toBeInTheDocument();
    expect(screen.queryByText(/Anthropic|Groq|OpenRouter/)).not.toBeInTheDocument();
  });
});
