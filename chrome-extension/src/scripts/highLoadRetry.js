/**
 * Detection and retry helpers for IRCTC server-side errors (issue #86).
 *
 * During Tatkal peak IRCTC answers a click with an error toast instead of
 * navigating, so the DOM the automation waits for never appears and an unbounded
 * waitForElementToAppear() hangs the run.
 *
 * Three things a live Tatkal run showed, all handled below:
 *  1. Every rejection carries a fresh reference id, so raw text comparison reads
 *     each poll as a brand new error.
 *  2. The toast can appear while IRCTC's request is still in flight, so retrying
 *     on the toast alone double-submits the step.
 *  3. Each click opens a new server transaction - fast retries only add load.
 */

import Logger from './logger';

const WHITESPACE = /\s+/g;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// IRCTC's toast is PrimeNG 7 (ui-toast-* namespace), so the message text lives in
// .ui-toast-detail / .ui-toast-summary inside p-toast. Scoped and named exactly:
// a generic [role="alert"] also matched ordinary page banners.
export const ERROR_MESSAGE_DEFAULT = [
  'p-toast .ui-toast-detail',
  'p-toast .ui-toast-summary',
  'p-toast .ui-toast-message-text-content',
].join(', ');

// On the train list IRCTC does not use a toast at all: it replaces the class row
// with plain text under the tab strip. The message has no class of its own, so it
// is found by scanning the leaf nodes of the train component.
export const ERROR_INLINE_SCOPE_DEFAULT = 'app-train-avl-enq';

// The toast's own close control: PrimeNG renders it as <a class="ui-toast-close-icon">
// inside .ui-toast-message-content. The sibling span.ui-toast-icon.pi-times-circle is
// only the severity badge and does not close anything. The train-row banner closes
// via span.fa-close inside a div.link; the NTES links in that banner are also
// div.link, so the icon has to be named or a dismiss would navigate off the page.
export const ERROR_DISMISS_DEFAULT = [
  'p-toast .ui-toast-close-icon',
  'app-train-avl-enq .link > .fa-close',
].join(', ');


// IRCTC blocks the page with a "Please Wait..." overlay while a request runs.
export const LOADER_DEFAULT = [
  '#loaderP',
  '.loader',
  '.loadding',
  '.spinner',
  '.spinner-border',
  'ngx-spinner',
  '.ngx-spinner-overlay',
  '.loader-container',
].join(', ');

// Server-side hiccups: clicking again shortly after usually works.
const TRANSIENT_PATTERNS = [
  /we are experiencing high load/i,
  /high load/i,
  /unable to process (your |the )?request/i,
  // "Error! Unable to perform Transaction. Please try again." - the train list's
  // most common Tatkal rejection. Listed in its own right so it still classifies
  // if IRCTC drops the trailing "Please try again".
  /unable to perform (this )?transaction/i,
  /service (is )?(temporarily )?unavailable/i,
  /server (is )?busy/i,
  /internal server error/i,
  /request time[d]? ?out/i,
  /please retry/i,
  /please try again/i,
];

// Failures a re-click cannot fix. Checked before the transient list, because
// "session expired, please try again" also matches /please try again/.
const TERMINAL_PATTERNS = [
  /user\s*id|password|user name|username/i,
  /session (has )?expired|logged out/i,
  /maximum|limit exceeded/i,
];

// Not retryable and not this module's business: the captcha stage re-solves, the
// availability loop handles a sold-out train, and the booking-time gate covers
// quota windows. Matched first so none of them abort a healthy run.
const NOT_OUR_ERROR_PATTERNS = [
  /captcha/i,
  /no (seats|berth)|not available|waitlist|regret/i,
  /booking (is )?not allowed|quota/i,
];

// Shown for the first second or two of a Tatkal window: the class and quota are
// right, the clock is just early, and IRCTC clears it the moment the window opens.
// It carries the word "quota" ("...selected quota and class..."), so without this
// it fell into the NOT_OUR "quota" pattern and the availability loop stopped
// refreshing at the exact moment it needed to keep trying.
const BOOKING_NOT_OPEN_PATTERNS = [
  /booking not (yet )?started/i,
  /try after some time/i,
];

// IRCTC stamps a reference id and the client IP into each rejection, and the id
// changes on every attempt. Strip anything volatile so repeats of one failure
// share an identity.
const VOLATILE_TOKENS = [
  /client\s*ip\s*:?\s*\S+/gi,
  /\b[0-9a-f]+(?:\.[0-9a-f]+){2,}\b/gi,
  /\b\d{5,}\b/g,
];

export function errorIdentity(rawText) {
  let identity = String(rawText || '');
  for (const token of VOLATILE_TOKENS) identity = identity.replace(token, ' ');
  return identity
    .replace(/[^a-z0-9 ]+/gi, ' ')
    .replace(WHITESPACE, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Classify on-screen text. Returns null for anything unrecognised: an unknown
 * message is more likely form validation than a server failure, and acting on it
 * would replay a step IRCTC already accepted.
 */
export function classifyIrctcError(rawText) {
  if (!rawText) return null;

  const message = String(rawText).replace(WHITESPACE, ' ').trim();
  if (!message) return null;

  // Checked before NOT_OUR: this shares the word "quota" with the permanent
  // "booking not allowed in this quota", but it is the opposite - a window that is
  // about to open - so it has to be retried, not treated as our-business-none.
  if (BOOKING_NOT_OPEN_PATTERNS.some((pattern) => pattern.test(message))) {
    return { message, identity: errorIdentity(message), kind: 'transient' };
  }
  if (NOT_OUR_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return null;
  if (TERMINAL_PATTERNS.some((pattern) => pattern.test(message))) {
    return { message, identity: errorIdentity(message), kind: 'terminal' };
  }
  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(message))) {
    return { message, identity: errorIdentity(message), kind: 'transient' };
  }
  return null;
}

const isPainted = (node) => node.offsetParent !== null || node.getClientRects().length > 0;

// Look through every visible error container for a message we understand.
export function findIrctcError(
  errorSelector = ERROR_MESSAGE_DEFAULT,
  inlineScope = ERROR_INLINE_SCOPE_DEFAULT,
) {
  let nodes;
  try {
    nodes = document.querySelectorAll(errorSelector);
  } catch (error) {
    Logger.error('Invalid error message selector:', errorSelector, error);
    return null;
  }

  for (const node of nodes) {
    // Toasts stay in the DOM after they fade out, so skip anything not painted.
    if (!isPainted(node)) continue;

    const found = classifyIrctcError(node.innerText || node.textContent);
    if (found) return { ...found, node };
  }

  return findInlineIrctcError(inlineScope);
}

/**
 * The train-list rejection is rendered inline, not as a toast. Only leaf nodes are
 * read: the whole row also carries the availability wording, which classifies as
 * "not our error" and would hide the real message.
 */
export function findInlineIrctcError(scopeSelector = ERROR_INLINE_SCOPE_DEFAULT) {
  if (!scopeSelector) return null;

  let scopes;
  try {
    scopes = document.querySelectorAll(scopeSelector);
  } catch (err) {
    Logger.error('Invalid inline error scope selector:', scopeSelector, err);
    return null;
  }

  for (const scope of scopes) {
    for (const node of scope.querySelectorAll('div, span, p, strong, td')) {
      if (node.children.length) continue;
      if (!isPainted(node)) continue;

      const found = classifyIrctcError(node.textContent);
      if (found) return { ...found, node };
    }
  }
  return null;
}

// Close every visible toast, not only the one that matched: under load IRCTC
// stacks them and a leftover keeps satisfying findIrctcError() on the next poll.
// The toast has no retry control - the only <a> in it is .ui-toast-close-icon - so
// re-running the step action is what actually retries.
export async function dismissIrctcError({
  dismissSelector = ERROR_DISMISS_DEFAULT,
  click,
} = {}) {
  let buttons;
  try {
    buttons = document.querySelectorAll(dismissSelector);
  } catch (err) {
    Logger.error('Invalid error dismiss selector:', dismissSelector, err);
    return false;
  }

  let dismissed = false;
  for (const button of buttons) {
    if (button.offsetParent === null && button.getClientRects().length === 0) continue;
    try {
      if (click) {
        await click(button);
      } else {
        button.click();
      }
      dismissed = true;
    } catch (err) {
      Logger.warn('Could not dismiss an IRCTC error toast:', err);
    }
  }
  return dismissed;
}

// True while IRCTC is blocking the page with its loading overlay.
export function isLoaderVisible(selector = LOADER_DEFAULT) {
  let nodes;
  try {
    nodes = document.querySelectorAll(selector);
  } catch (err) {
    Logger.error('Invalid loader selector:', selector, err);
    return false;
  }

  for (const node of nodes) {
    if (node.offsetParent !== null || node.getClientRects().length) return true;
  }

  // Some pages show the overlay as plain "Please Wait..." text with none of the
  // classes above.
  for (const node of document.querySelectorAll('div, span, p, h4')) {
    if (node.children.length) continue;
    if (!/^please\s*wait\.{0,3}$/i.test((node.textContent || '').trim())) continue;
    if (node.offsetParent !== null || node.getClientRects().length) return true;
  }
  return false;
}

// Never click while a request is in flight. Returns false if the overlay outlives
// the wait, so the caller can decide to go ahead anyway.
export async function waitForLoaderToClear({
  selector = LOADER_DEFAULT,
  timeoutMs = 20000,
  pollMs = 250,
} = {}) {
  const startTime = Date.now();

  while (isLoaderVisible(selector)) {
    if (Date.now() - startTime >= timeoutMs) return false;
    await sleep(pollMs);
  }
  return true;
}

/**
 * Retry delay: 2.0-3.5s, 4.0-5.5s, 8.0-9.5s, then 10.0-11.5s.
 *
 * Exponential with a floor, because fast retries measurably do not work - each
 * click opens a new server transaction rather than re-driving the failed one.
 * The jitter keeps us off the same schedule as every other script in the window.
 */
export const BACKOFF_FLOOR_MS = 2000;
export const BACKOFF_CAP_MS = 10000;

export function backoffDelay(attempt) {
  const step = Math.min(BACKOFF_CAP_MS, BACKOFF_FLOOR_MS * 2 ** Math.max(0, attempt - 1));
  return step + Math.floor(Math.random() * 1500);
}

/**
 * How long one step may spend recovering.
 *
 * The bound is the clock, not a number of attempts: what expires is the seat, and
 * with exponential backoff a fixed count is worth anywhere between 30s and several
 * minutes. This also keeps high-load recovery out of the options page - there is
 * nothing to switch off or set to 0.
 */
export const RETRY_BUDGET_MS = 150000;

// A step that never changes and never reports anything gets its own, longer stop.
// IRCTC answers a signed-out session with silence, and without this the wait loop
// had nothing to end it.
export const STALL_BUDGET_MS = 180000;

// Derived stop so the loop is finite even if the clock misbehaves: no step can
// retry more often than its budget could pay for at the shortest delay allowed.
export function attemptCeiling(budgetMs = RETRY_BUDGET_MS) {
  return Math.max(1, Math.ceil(budgetMs / BACKOFF_FLOOR_MS));
}

function hasAdvanced({ appear, disappear }) {
  if (appear) return !!document.querySelector(appear);
  if (disappear) return !document.querySelector(disappear);
  return false;
}

// IRCTC ends a session that idles too long, submits too fast, or trips its bot
// checks during a Tatkal window; it then bounces the tab to an error URL. None of
// that is retryable - re-clicking a logged-out page only looks more like a bot - so
// it is treated as terminal and handed back to the user.
//
// /nget/train-search is deliberately NOT here: that is the page the run starts on
// and logs in from, so matching it aborted every login. A logout that lands back
// there is caught by the login form instead.
const SESSION_LOST_URL = /\/nget\/error|SessionTimeOut|logout/i;

export function isSessionLost(loginSelector) {
  const href = (typeof location !== 'undefined' && location.href) || '';
  if (SESSION_LOST_URL.test(href)) return true;
  // The login form reappearing mid-run means the same thing without a URL change.
  if (loginSelector) {
    try {
      const login = document.querySelector(loginSelector);
      if (login && (login.offsetParent !== null || login.getClientRects().length)) return true;
    } catch (err) {
      Logger.error('Invalid login selector for session check:', loginSelector, err);
    }
  }
  return false;
}

/**
 * Poll until the flow reaches the next page, IRCTC reports an error, or the
 * attempt window runs out. `target` is { appear: selector } or { disappear: selector }.
 */
export async function waitForOutcome({
  target,
  errorSelector = ERROR_MESSAGE_DEFAULT,
  inlineScope = ERROR_INLINE_SCOPE_DEFAULT,
  loginSelector,
  timeoutMs = 20000,
  pollMs = 250,
}) {
  const startTime = Date.now();

  for (;;) {
    // Checked before the error so a stale toast cannot mask real progress.
    if (hasAdvanced(target)) return { status: 'advanced' };

    if (isSessionLost(loginSelector)) return { status: 'session-lost' };

    const error = findIrctcError(errorSelector, inlineScope);
    if (error) return { status: 'error', error };

    if (Date.now() - startTime >= timeoutMs) return { status: 'timeout' };

    await sleep(pollMs);
  }
}

/**
 * Wait until the page is genuinely idle: no loader, no error toast, both true
 * continuously for `settleMs`. Returns false if it never goes quiet - a stuck
 * toast must not deadlock the run.
 */
export async function waitForQuiet({
  errorSelector = ERROR_MESSAGE_DEFAULT,
  inlineScope = ERROR_INLINE_SCOPE_DEFAULT,
  loaderSelector = LOADER_DEFAULT,
  settleMs = 1500,
  timeoutMs = 15000,
  pollMs = 250,
} = {}) {
  const startTime = Date.now();
  let quietSince = null;

  for (;;) {
    if (isLoaderVisible(loaderSelector) || findIrctcError(errorSelector, inlineScope)) {
      quietSince = null;
    } else {
      if (quietSince === null) quietSince = Date.now();
      if (Date.now() - quietSince >= settleMs) return true;
    }

    if (Date.now() - startTime >= timeoutMs) return false;
    await sleep(pollMs);
  }
}

/**
 * Wait for a booking step to land, retrying whenever IRCTC answers with a
 * transient error. Runs on every step with no setting behind it.
 *
 * A plain timeout is NOT retried: with no page change and no error message IRCTC
 * is merely slow, and replaying the step could double-submit something it already
 * accepted. It is still bounded, so a page that goes quiet forever cannot hang the
 * run. Resolves to { ok: true } or
 * { ok: false, reason: 'terminal' | 'session-lost' | 'stalled' | 'exhausted', error }.
 */
export async function advanceOrRetry({
  name,
  target,
  retryAction,
  errorSelector = ERROR_MESSAGE_DEFAULT,
  inlineScope = ERROR_INLINE_SCOPE_DEFAULT,
  dismissSelector = ERROR_DISMISS_DEFAULT,
  loaderSelector = LOADER_DEFAULT,
  loginSelector,
  attemptTimeoutMs = 20000,
  settleMs = 1500,
  budgetMs = RETRY_BUDGET_MS,
  stallBudgetMs = STALL_BUDGET_MS,
  click,
}) {
  const ceiling = attemptCeiling(budgetMs);
  // Timed from the first rejection, not from entry: a slow page must not spend the
  // recovery budget of a step that has not failed yet.
  let firstFailureAt = 0;
  let attempt = 0;
  const enteredAt = Date.now();

  for (;;) {
    const outcome = await waitForOutcome({
      target,
      errorSelector,
      inlineScope,
      loginSelector,
      timeoutMs: attemptTimeoutMs,
    });

    if (outcome.status === 'advanced') {
      if (attempt > 0) Logger.info(`[${name}] recovered after ${attempt} retry(s).`);
      return { ok: true, attempts: attempt };
    }

    if (outcome.status === 'session-lost') {
      Logger.error(`[${name}] IRCTC ended the session - it will not accept any more clicks.`);
      return {
        ok: false,
        reason: 'session-lost',
        error: { message: 'IRCTC signed this session out. Log in again before retrying.' },
        attempts: attempt,
      };
    }

    if (outcome.status === 'timeout') {
      // Nothing to retry - no page change, no message - but this cannot wait
      // forever either: after a logout IRCTC answers every step with silence.
      const waitedMs = Date.now() - enteredAt;
      if (waitedMs >= stallBudgetMs) {
        Logger.error(`[${name}] nothing happened for ${Math.round(waitedMs / 1000)}s. Stopping.`);
        return {
          ok: false,
          reason: 'stalled',
          error: { message: `IRCTC stopped responding at "${name}" and reported no error.` },
          attempts: attempt,
          elapsedMs: waitedMs,
        };
      }
      Logger.warn(`[${name}] still waiting - page has not changed and IRCTC reported nothing yet.`);
      continue;
    }

    const { error } = outcome;

    if (error.kind === 'terminal') {
      Logger.error(`[${name}] IRCTC returned a blocking error:`, error.message);
      return { ok: false, reason: 'terminal', error, attempts: attempt };
    }

    // A toast painted while the overlay is still up does not mean the step
    // finished - its request has not come back yet. Let it land before counting a
    // failure, otherwise the retry fires on top of an in-flight submit.
    if (isLoaderVisible(loaderSelector)) {
      Logger.info(`[${name}] error shown while a request is still in flight - letting it finish first.`);
      await waitForLoaderToClear({ selector: loaderSelector });
      if (hasAdvanced(target)) {
        Logger.info(`[${name}] page moved on once the request landed - no retry needed.`);
        return { ok: true, attempts: attempt };
      }
      // The message may have been superseded; re-read instead of trusting it.
      if (!findIrctcError(errorSelector, inlineScope)) continue;
    }

    if (!firstFailureAt) firstFailureAt = Date.now();
    const elapsedMs = Date.now() - firstFailureAt;

    if (elapsedMs >= budgetMs || attempt >= ceiling) {
      Logger.error(
        `[${name}] giving up after ${attempt} retry(s) over ${Math.round(elapsedMs / 1000)}s. Last error:`,
        error.message,
      );
      return { ok: false, reason: 'exhausted', error, attempts: attempt, elapsedMs };
    }

    attempt += 1;
    const wait = backoffDelay(attempt);
    Logger.warn(
      `[${name}] IRCTC is under load (retry ${attempt}, ${Math.round(elapsedMs / 1000)}s of ${Math.round(budgetMs / 1000)}s used, next in ${Math.round(wait / 1000)}s):`,
      error.message,
    );

    // Clear the rejection so the next poll reads fresh state; the retryAction
    // below is what actually re-runs the step.
    await dismissIrctcError({ dismissSelector, click });

    await sleep(wait);

    // Do not re-fire into a page that is still working or still showing the
    // rejection - that is what turned one bad click into a burst of them.
    if (!(await waitForQuiet({ errorSelector, inlineScope, loaderSelector, settleMs }))) {
      Logger.warn(`[${name}] page never settled; retrying anyway.`);
    }

    // The page may have moved on while we were backing off.
    if (hasAdvanced(target)) {
      Logger.info(`[${name}] page moved on during backoff - no retry needed.`);
      return { ok: true, attempts: attempt };
    }

    // Re-checked here as well: a session dropped during the backoff would
    // otherwise take one more click, which is exactly what IRCTC flags.
    if (isSessionLost(loginSelector)) {
      Logger.error(`[${name}] session was lost during backoff - not retrying.`);
      return {
        ok: false,
        reason: 'session-lost',
        error: { message: 'IRCTC signed this session out. Log in again before retrying.' },
        attempts: attempt,
      };
    }

    if (retryAction) await retryAction();
  }
}
