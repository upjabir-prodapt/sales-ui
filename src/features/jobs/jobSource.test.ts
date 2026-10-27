import { describe, expect, it } from 'vitest';
import { shortRunLabel } from '@aicoe/aihub-platform/jobs';
import { openRunFeedback } from '@aicoe/aihub-platform/ui';
import type { ResearchJobListItem } from '../../api/client';
import {
  extractSalesDetail,
  normalizeSalesHistoryItem,
  normalizeSalesJob,
  salesJobSource,
} from './jobSource';
import type { ResearchResultResponse } from '../../api/types';

/**
 * The Sales page used to render model/tokens/time/cost in its own inline report
 * panel, which only ever described the newest run. That panel is gone and the
 * figures are surfaced per row instead, so this mapping is now the only path
 * those numbers travel.
 */

function result(card: ResearchResultResponse['model_card']): ResearchResultResponse {
  return { job_id: 'j1', status: 'COMPLETED', model_card: card } as ResearchResultResponse;
}

describe('extractSalesDetail', () => {
  it('maps the service model_card onto the shared detail shape', () => {
    const detail = extractSalesDetail(
      result({
        model_version: 'gemini-2.5-pro',
        tokens_used: 18_432,
        latency_seconds: 134.2,
        cost_usd: 0.4231,
      }),
    );

    expect(detail).toEqual({
      costUsd: 0.4231,
      tokenCount: 18_432,
      processingTimeSeconds: 134.2,
      modelUsed: 'gemini-2.5-pro',
      modelVersion: 'gemini-2.5-pro',
      // The research pipeline reports no per-run quality score.
      qualityScore: null,
    });
  });

  it('nulls every figure when the run carries no model_card', () => {
    expect(extractSalesDetail(result(null))).toEqual({
      costUsd: null,
      tokenCount: null,
      processingTimeSeconds: null,
      modelUsed: null,
      modelVersion: null,
      qualityScore: null,
    });
  });

  it('rejects non-numeric figures rather than rendering NaN', () => {
    const detail = extractSalesDetail(
      result({
        model_version: null,
        tokens_used: null,
        latency_seconds: undefined,
        cost_usd: null,
      }),
    );
    expect(detail.tokenCount).toBeNull();
    expect(detail.processingTimeSeconds).toBeNull();
    expect(detail.costUsd).toBeNull();
    expect(detail.modelUsed).toBeNull();
  });
});

function historyItem(overrides: Partial<ResearchJobListItem> = {}): ResearchJobListItem {
  return { job_id: 'job-123456789', status: 'completed', ...overrides };
}

describe('normalizeSalesHistoryItem', () => {
  it("maps the service's statuses onto the shared ones, unknown as queued", () => {
    const mapped = ['pending', 'QUEUED', 'processing', 'Running', 'completed', 'failed', 'cancelled', 'weird'].map(
      (status) => normalizeSalesHistoryItem(historyItem({ status })).status,
    );
    expect(mapped).toEqual([
      'queued',
      'queued',
      'running',
      'running',
      'completed',
      'failed',
      'cancelled',
      'queued',
    ]);
  });

  it('titles a run by company_name, then company, then a short run label', () => {
    expect(normalizeSalesHistoryItem(historyItem({ company_name: ' Acme ', company: 'Other' })).title).toBe(
      'Acme',
    );
    expect(normalizeSalesHistoryItem(historyItem({ company_name: '  ', company: 'Other' })).title).toBe(
      'Other',
    );
    expect(normalizeSalesHistoryItem(historyItem()).title).toBe(shortRunLabel('job-123456789'));
  });

  it('offers cancel while active and download/review once completed', () => {
    const running = normalizeSalesHistoryItem(historyItem({ status: 'running', account_id: 'ACC-1' }));
    expect(running).toMatchObject({
      key: 'sales:job-123456789',
      service: 'sales',
      subtitle: 'Sales research · Account ACC-1',
      canCancel: true,
      canDownload: false,
      canReview: false,
    });

    const done = normalizeSalesHistoryItem(historyItem({ status: 'completed' }));
    expect(done).toMatchObject({
      subtitle: 'Sales research',
      canCancel: false,
      canDownload: true,
      canReview: true,
    });
  });
});

describe('normalizeSalesJob', () => {
  it('maps an in-session record before the server history has it', () => {
    const job = normalizeSalesJob({
      job_id: 'j9',
      company_name: 'Acme',
      account_id: 'ACC-9',
      status: 'PROCESSING',
      createdAt: '2026-01-01T00:00:00Z',
      completedAt: null,
      errorMessage: null,
    });
    expect(job).toMatchObject({
      key: 'sales:j9',
      id: 'j9',
      title: 'Acme',
      subtitle: 'Sales research · Account ACC-9',
      status: 'running',
      progress: null,
      createdAt: '2026-01-01T00:00:00Z',
      canCancel: true,
      canDownload: false,
    });
  });
});

describe('feedback', () => {
  it('sends feedback on a run to the AI Hub ticket form, not a dialog of its own', () => {
    expect(salesJobSource.openFeedback).toBe(openRunFeedback);
    expect(salesJobSource.ReviewModal).toBeUndefined();
  });
});
