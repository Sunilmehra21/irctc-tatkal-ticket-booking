const fs = require('fs');
const CRLF = '\r\n';
let u = fs.readFileSync('chrome-extension/src/scripts/user-script.js', 'utf8');

// Add selectBoardingStation call after addMobileNumber in addPassengerInputAndContinue
const oldCode = `  await addMobileNumber();${CRLF}  
  await selectPreferences();`;
const newCode = `  await addMobileNumber();${CRLF}
  await selectBoardingStation();${CRLF}
  await selectPreferences();`;
u = u.replace(oldCode, newCode);

fs.writeFileSync('chrome-extension/src/scripts/user-script.js', u);
console.log('Added selectBoardingStation call');