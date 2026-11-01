import { describe, expect, it } from 'vitest';
import { canRetry, noticeFor, type AssistantFailureReason } from './aiNotice';

describe('noticeFor', () => {
  it.each<[AssistantFailureReason, string]>([
    ['too-fast', 'Please wait a few seconds between questions.'],
    ['limit', "You have used today's AI questions. They reset tomorrow. This is a built-in answer."],
    ['busy', 'The AI assistant is busy. Try again in a minute. This is a built-in answer.'],
    ['timeout', 'The AI assistant took too long to answer. This is a built-in answer.'],
    ['sign-in', 'Sign in to use the AI Advisor. This is a built-in answer.'],
    ['no-session', 'Sign in to use the AI Advisor. This is a built-in answer.'],
    ['not-allowed', 'The AI assistant is not available right now. This is a built-in answer.'],
    ['unavailable', 'The AI assistant is not available right now. This is a built-in answer.'],
    ['error', 'The AI assistant is not available right now. This is a built-in answer.'],
  ])('says the right thing for %s', (reason, text) => {
    expect(noticeFor(reason, 3)).toBe(text);
  });

  it('uses a longer wait when the server asks for one', () => {
    expect(noticeFor('too-fast', 12)).toBe('Please wait 12 seconds between questions.');
  });

  it('uses plain punctuation', () => {
    for (const reason of ['too-fast', 'limit', 'busy', 'timeout', 'sign-in', 'unavailable'] as const) {
      expect(noticeFor(reason)).not.toMatch(/[–—]/);
    }
  });

  it('offers Try again only where asking again soon can work', () => {
    expect(['too-fast', 'busy', 'timeout'].every(r => canRetry(r as AssistantFailureReason))).toBe(true);
    expect(['limit', 'sign-in', 'no-session', 'not-allowed', 'unavailable', 'error'].some(r => canRetry(r as AssistantFailureReason))).toBe(false);
  });
});
