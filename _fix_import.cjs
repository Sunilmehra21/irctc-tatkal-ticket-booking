const fs = require('fs');
let u = fs.readFileSync('chrome-extension/src/scripts/user-script.js', 'utf8');

// Fix the import section - it still has conflict markers
let bad = `import {
  ERROR_MESSAGE_DEFAULT,
  ERROR_DISMISS_DEFAULT,
<<<<<<< HEAD
  ERROR_INLINE_SCOPE_DEFAULT,
  LOADER_DEFAULT,
  STALL_BUDGET_MS,
  advanceOrRetry,
  backoffDelay,
  dismissIrctcError,
  findIrctcError,
  isSessionLost,
  waitForQuiet,
} from './highLoadRetry';
=======
  ERROR_TOAST_LINK_DEFAULT,
  LOADER_DEFAULT,
  AVAILABILITY_ERROR_DEFAULT,
  advanceOrRetry,
  createRequestGate,
  holdForPassengerPageMinWait,
  findAvailabilityError,
  isWorthRetrying,
  waitForQuiet,
  waitForLoaderToClear,
  dismissIrctcError,
} from './irctcHighLoad';
>>>>>>> fix/high-load-retry-v2
}`;
let good = `import {
  ERROR_MESSAGE_DEFAULT,
  ERROR_DISMISS_DEFAULT,
  ERROR_TOAST_LINK_DEFAULT,
  LOADER_DEFAULT,
  AVAILABILITY_ERROR_DEFAULT,
  advanceOrRetry,
  createRequestGate,
  holdForPassengerPageMinWait,
  findAvailabilityError,
  isWorthRetrying,
  waitForQuiet,
  waitForLoaderToClear,
  dismissIrctcError,
} from './irctcHighLoad';`;
u = u.replace(bad, good);

// Also check for any other remaining markers
const markers = (u.match(/<<<<<<<|=======|>>>>>>>/g) || []).length;
console.log('markers in user-script.js:', markers);

fs.writeFileSync('chrome-extension/src/scripts/user-script.js', u);
console.log('Fixed user-script.js imports');