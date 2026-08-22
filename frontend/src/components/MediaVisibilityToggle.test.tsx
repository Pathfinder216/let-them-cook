import { render, screen, fireEvent } from '@testing-library/react';
import { MediaVisibilityToggle } from './MediaVisibilityToggle';

describe('MediaVisibilityToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is a quiet icon-only button while media is visible', () => {
    render(<MediaVisibilityToggle />);

    const button = screen.getByRole('button', { name: /hide media/i });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('');
  });

  // The hidden state used to be an unlabelled slashed icon, which read as "this recipe has
  // no photos" rather than "you turned photos off" — the preference is sticky per device.
  it('calls out the hidden state with a label and amber styling', () => {
    localStorage.setItem('ltc:showMedia', 'false');
    render(<MediaVisibilityToggle />);

    const button = screen.getByRole('button', { name: /show media/i });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('Photos hidden');
    expect(button.className).toContain('amber');
    expect(button.getAttribute('title')).toMatch(/hidden — click to show/i);
  });

  it('drops the callout again once media is turned back on', () => {
    localStorage.setItem('ltc:showMedia', 'false');
    render(<MediaVisibilityToggle />);

    fireEvent.click(screen.getByRole('button', { name: /show media/i }));

    const button = screen.getByRole('button', { name: /hide media/i });
    expect(button).toHaveTextContent('');
    expect(button.className).not.toContain('amber');
  });
});
