/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;
var Wallet = require('ripple-lib').Wallet;
var functions = require('./functions');

var remote = functions.remote;

var errorHandler = functions.errorHandler;

var rootAccount = functions.rootAccount;

var prefix = functions.prefix;

var getClosedLedger = functions.getClosedLedger;

function logClosedLedger() {
  var ledger = getClosedLedger();

  ledger.on('success', function onSuccess(res) {
    // console.log(res);
    console.log('\nLedger: ' + res.ledger.ledger_index);
    console.log(prefix + 'Close time: ' + res.ledger.close_time_human);
    console.log(prefix + 'Total coins: ' + res.ledger.total_coins);
    console.log(prefix + 'Number of known accounts: '
      + res.ledger.accountState.length);

    remote.disconnect();
  });

  return ledger;
}

remote.once('connect', function() {
  /* remote connected */
  logClosedLedger();

});
remote.connect();



