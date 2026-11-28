const fs = require('fs');
const CRLF = '\r\n';
let u = fs.readFileSync('chrome-extension/src/scripts/user-script.js', 'utf8');

// Add boardingStation to defaultSettings
let bad = `const defaultSettings = {${CRLF}  automationStatus: false,${CRLF}  username: '',${CRLF}  password: '',${CRLF}  targetTime: '09:59:53',${CRLF}  passengerList: [],${CRLF}  infantList: [],${CRLF}  showInfant: false,${CRLF}  masterData: false,${CRLF}  passengerNames: [],${CRLF}  trainNumber: '',${CRLF}  from: '',${CRLF}  to: '',${CRLF}  quotaType: '',${CRLF}  isOpeningDayBooking: false,${CRLF}  accommodationClass: '',${CRLF}  dateString: '',${CRLF}  refreshTime: 5000,`;
let good = `const defaultSettings = {${CRLF}  automationStatus: false,${CRLF}  username: '',${CRLF}  password: '',${CRLF}  targetTime: '09:59:53',${CRLF}  passengerList: [],${CRLF}  infantList: [],${CRLF}  showInfant: false,${CRLF}  masterData: false,${CRLF}  passengerNames: [],${CRLF}  trainNumber: '',${CRLF}  from: '',${CRLF}  to: '',${CRLF}  boardingStation: '',${CRLF}  quotaType: '',${CRLF}  isOpeningDayBooking: false,${CRLF}  accommodationClass: '',${CRLF}  dateString: '',${CRLF}  refreshTime: 5000,`;
u = u.replace(bad, good);

// Add boardingStation variable declaration
let bad2 = `let automationStatus = false;${CRLF}let username = '';${CRLF}let password = '';${CRLF}let targetTime ='09:59:53'${CRLF}let passengerList = [];${CRLF}let infantList = [];${CRLF}let showInfant = false;${CRLF}let masterData = false;${CRLF}let passengerNames = '';${CRLF}let trainNumber = '';${CRLF}let from = '';${CRLF}let to = '';${CRLF}let quotaType = '';`;
let good2 = `let automationStatus = false;${CRLF}let username = '';${CRLF}let password = '';${CRLF}let targetTime ='09:59:53'${CRLF}let passengerList = [];${CRLF}let infantList = [];${CRLF}let showInfant = false;${CRLF}let masterData = false;${CRLF}let passengerNames = '';${CRLF}let trainNumber = '';${CRLF}let from = '';${CRLF}let to = '';${CRLF}let boardingStation = '';${CRLF}let quotaType = '';`;
u = u.replace(bad2, good2);

// Add boarding station dropdown selector
let bad3 = `// TRAIN LIST ${CRLF}let TRAIN_LIST_COMPONENT = 'app-train-list';${CRLF}let TRAIN_COMPONENT = 'app-train-avl-enq';${CRLF}let FIND_TRAIN_NUMBER = 'app-train-avl-enq .train-heading';${CRLF}let AVAILABLE_CLASS = '.pre-avl';`;
let good3 = `// TRAIN LIST ${CRLF}let TRAIN_LIST_COMPONENT = 'app-train-list';${CRLF}let TRAIN_COMPONENT = 'app-train-avl-enq';${CRLF}let FIND_TRAIN_NUMBER = 'app-train-avl-enq .train-heading';${CRLF}let AVAILABLE_CLASS = '.pre-avl';${CRLF}let PASSENGER_BOARDING_DROPDOWN = 'p-dropdown[formcontrolname="boardingStation"]';`;
u = u.replace(bad3, good3);

fs.writeFileSync('chrome-extension/src/scripts/user-script.js', u);
console.log('Added boardingStation basics');