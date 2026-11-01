/** Why the AI assistant could not answer. 'error' is an unknown failure. */
export type AssistantFailureReason =
  | 'no-session' | 'too-fast' | 'limit' | 'busy' | 'sign-in' | 'not-allowed' | 'unavailable' | 'timeout' | 'error';

const BUILT_IN = 'This is a built-in answer.';

/**
 * One plain sentence for the user when a built-in answer is shown instead of an AI one.
 * Pure, so the wording is tested without a browser.
 */
export function noticeFor(reason: AssistantFailureReason, retryAfterSeconds?: number): string {
  switch (reason) {
    case 'too-fast':
      return retryAfterSeconds && retryAfterSeconds > 5
        ? `Please wait ${Math.ceil(retryAfterSeconds)} seconds between questions.`
        : 'Please wait a few seconds between questions.';
    case 'limit':
      return `You have used today's AI questions. They reset tomorrow. ${BUILT_IN}`;
    case 'busy':
      return `The AI assistant is busy. Try again in a minute. ${BUILT_IN}`;
    case 'timeout':
      return `The AI assistant took too long to answer. ${BUILT_IN}`;
    case 'sign-in':
    case 'no-session':
      return `Sign in to use the AI Advisor. ${BUILT_IN}`;
    default:
      return `The AI assistant is not available right now. ${BUILT_IN}`;
  }
}

/** Failures where asking again shortly can succeed, so the chat offers a Try again button. */
export function canRetry(reason: AssistantFailureReason): boolean {
  return reason === 'too-fast' || reason === 'busy' || reason === 'timeout';
}
