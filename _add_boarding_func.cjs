const fs = require('fs');
const CRLF = '\r\n';
let u = fs.readFileSync('chrome-extension/src/scripts/user-script.js', 'utf8');

// Add selectBoardingStation function after addMobileNumber
const boardingFunc = `async function selectBoardingStation() {
  if (!boardingStation || boardingStation.trim() === '') {
    Logger.info('No boarding station specified, keeping default.');
    return;
  }
  Logger.info('Selecting boarding station:', boardingStation);

  const dropdown = document.querySelector(PASSENGER_BOARDING_DROPDOWN);
  if (!dropdown) {
    Logger.warn('Boarding station dropdown not found.');
    return;
  }

  await humanClick(dropdown);
  await delay(300);

  const panel = document.querySelector('p-dropdownpanel .ui-dropdown-items');
  if (!panel) {
    Logger.warn('Boarding station panel did not open.');
    return;
  }

  const items = panel.querySelectorAll('li');
  let found = false;
  for (const li of items) {
    const text = li.textContent.trim();
    if (text && text.toLowerCase().includes(boardingStation.toLowerCase())) {
      await humanClick(li);
      found = true;
      Logger.info('Boarding station option clicked:', text);
      break;
    }
  }

  if (!found) {
    Logger.warn('Boarding station not found in dropdown, keeping default.');
  }
}
`;

// Insert after addMobileNumber function
const insertAfter = 'async function addMobileNumber() {';
const idx = u.indexOf(insertAfter);
if (idx >= 0) {
  // Find the end of addMobileNumber function
  let braceCount = 0;
  let i = idx;
  while (i < u.length) {
    if (u[i] === '{') braceCount++;
    else if (u[i] === '}') {
      braceCount--;
      if (braceCount === 0) break;
    }
    i++;
  }
  if (braceCount === 0) {
    u = u.slice(0, i + 1) + CRLF + boardingFunc + u.slice(i + 1);
    console.log('Added selectBoardingStation function');
  }
} else {
  console.log('addMobileNumber not found');
}

fs.writeFileSync('chrome-extension/src/scripts/user-script.js', u);