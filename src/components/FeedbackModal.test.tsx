import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const submitResearchFeedback = vi.fn();

vi.mock('../api/client', () => ({
  submitResearchFeedback: (...args: unknown[]) => submitResearchFeedback(...args),
}));

import FeedbackModal from './FeedbackModal';

/**
 * The research feedback dialog. It shares the platform's FeedbackDialog with
 * Translation's review, so the 1-5 rating and the 2000-character cap pinned
 * here are the same numbers translation-ui pins.
 */

function renderModal(onSubmitted = vi.fn(), onClose = vi.fn()) {
  render(<FeedbackModal isOpen jobId="sales-job-1" onClose={onClose} onSubmitted={onSubmitted} />);
  return { onSubmitted, onClose };
}

describe('Sales FeedbackModal', () => {
  beforeEach(() => {
    submitResearchFeedback.mockReset();
    submitResearchFeedback.mockResolvedValue({
      job_id: 'sales-job-1',
      status: 'SUCCESS',
      message: 'ok',
    });
  });

  it('shows its own heading', () => {
    renderModal();
    expect(screen.getByText('Research Feedback')).toBeInTheDocument();
  });

  it('offers the shared 1-5 star control', () => {
    renderModal();
    const stars = within(screen.getByRole('group', { name: /rating/i })).getAllByRole('button');
    expect(stars).toHaveLength(5);
    expect(screen.getByText(/select a rating/i)).toBeInTheDocument();
  });

  it('requires a rating — a comment alone will not submit — and marks the comment optional', () => {
    renderModal();
    const submit = screen.getByRole('button', { name: /submit feedback/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Useful brief.' } });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '4 stars' }));
    expect(submit).toBeEnabled();
    expect(screen.getByText(/\(optional\)/i)).toBeInTheDocument();
  });

  it('caps the comment at the shared 2000 characters', () => {
    renderModal();
    expect(screen.getByText('0 / 2000')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x'.repeat(2500) } });
    expect(screen.getByText('2000 / 2000')).toBeInTheDocument();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toHaveLength(2000);
  });

  it('submits a rating on its own, omitting the optional comment, then closes', async () => {
    const { onSubmitted, onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: '5 stars' }));
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    // Positional args, and undefined rather than '': the service rejects an
    // empty comment.
    await waitFor(() =>
      expect(submitResearchFeedback).toHaveBeenCalledWith('sales-job-1', 5, undefined),
    );
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(true, expect.any(String)));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('submits the rating with trimmed comment text', async () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: '3 stars' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  Missed their recent acquisition.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() =>
      expect(submitResearchFeedback).toHaveBeenCalledWith(
        'sales-job-1',
        3,
        'Missed their recent acquisition.',
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('treats a whitespace-only comment as no comment', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: '1 star' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() =>
      expect(submitResearchFeedback).toHaveBeenCalledWith('sales-job-1', 1, undefined),
    );
  });

  it('reports a failure without closing, so the text is not lost', async () => {
    submitResearchFeedback.mockRejectedValue(new Error('Upstream unavailable'));
    const { onSubmitted, onClose } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: '2 stars' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Worth keeping.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(false, 'Upstream unavailable'));
    expect(onClose).not.toHaveBeenCalled();
    // The typed comment survives, and the form is usable again.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Worth keeping.');
    expect(screen.getByRole('button', { name: /submit feedback/i })).toBeEnabled();
  });
});
