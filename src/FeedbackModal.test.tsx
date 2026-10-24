import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const submitResearchFeedback = vi.fn();

vi.mock('./usecases/sales/api', () => ({
  submitResearchFeedback: (...a: unknown[]) => submitResearchFeedback(...a),
}));

import FeedbackModal from './usecases/sales/FeedbackModal';

/**
 * The Sales half of the hub's feedback-dialog parity test
 * (aihub-ui frontend/src/app/feedbackParity.test.tsx). The Translation half
 * lives in translation-ui; both pin the same numbers, so the two dialogs cannot
 * drift apart again now that they live in separate repositories.
 *
 * Kept outside src/usecases/ so that folder stays a byte-for-byte copy of the
 * hub's.
 */

describe('Sales feedback dialog', () => {
  beforeEach(() => {
    submitResearchFeedback.mockReset().mockResolvedValue({ status: 'SUCCESS' });
  });

  it('shows its own heading', () => {
    render(<FeedbackModal isOpen jobId="j1" onClose={vi.fn()} onSubmitted={vi.fn()} />);
    expect(screen.getByText('Research Feedback')).toBeInTheDocument();
  });

  it('offers the shared 1-5 star control', () => {
    render(<FeedbackModal isOpen jobId="j1" onClose={vi.fn()} onSubmitted={vi.fn()} />);
    const stars = within(screen.getByRole('group', { name: /rating/i })).getAllByRole('button');
    expect(stars).toHaveLength(5);
    expect(screen.getByText(/select a rating/i)).toBeInTheDocument();
  });

  it('requires a rating and treats the comment as optional', () => {
    render(<FeedbackModal isOpen jobId="j1" onClose={vi.fn()} onSubmitted={vi.fn()} />);
    const submit = screen.getByRole('button', { name: /submit feedback/i });

    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A comment.' } });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '4 stars' }));
    expect(submit).toBeEnabled();
    expect(screen.getByText(/\(optional\)/i)).toBeInTheDocument();
  });

  it('caps the comment at the shared 2000 characters', () => {
    render(<FeedbackModal isOpen jobId="j1" onClose={vi.fn()} onSubmitted={vi.fn()} />);
    expect(screen.getByText('0 / 2000')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x'.repeat(2500) } });
    expect(screen.getByText('2000 / 2000')).toBeInTheDocument();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toHaveLength(2000);
  });

  it('keeps the dialog open when the submit fails', async () => {
    submitResearchFeedback.mockRejectedValue(new Error('Upstream unavailable'));

    const onClose = vi.fn();
    const onSubmitted = vi.fn();
    render(<FeedbackModal isOpen jobId="j1" onClose={onClose} onSubmitted={onSubmitted} />);

    fireEvent.click(screen.getByRole('button', { name: '3 stars' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Worth keeping.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(false, 'Upstream unavailable'));
    expect(onClose).not.toHaveBeenCalled();
    // The typed comment survives, and the form is usable again.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Worth keeping.');
    expect(screen.getByRole('button', { name: /submit feedback/i })).toBeEnabled();
  });

  it('closes and reports success', async () => {
    const onClose = vi.fn();
    const onSubmitted = vi.fn();
    render(<FeedbackModal isOpen jobId="j1" onClose={onClose} onSubmitted={onSubmitted} />);

    fireEvent.click(screen.getByRole('button', { name: '5 stars' }));
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(true, expect.any(String)));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('passes positional args, with undefined for an absent comment', async () => {
    render(<FeedbackModal isOpen jobId="s1" onClose={vi.fn()} onSubmitted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '2 stars' }));
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));
    await waitFor(() => expect(submitResearchFeedback).toHaveBeenCalledWith('s1', 2, undefined));
  });
});
