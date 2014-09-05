/*
We need this functionality for test network scripts:
1. Create 300,000 accounts
2. Figure out how many tx/sec total is possible for these accounts
3. Initial tx set will be just xrp transfers
4. Subsequent version will submit order book tx and determine the tx/sec possible for order book tx

"Figure out" means try shorter intervals until a failure occurs.
*/

var expectedAccounts = 300000;
var fundingmin = 300;
var fundingmax = 10000;
var paymentmin = 1;
var paymentmax = 1000;

/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;
var Wallet = require('ripple-lib').Wallet;
var functions = require('./functions');

var remote = functions.remote;
var errorHandler = functions.errorHandler;
var rootAccount = functions.rootAccount;
var wallets = functions.wallets;
var fundedWallets = functions.fundedWallets;
var prefix = functions.prefix;
var date = functions.date;

var getAccountInfo = functions.getAccountInfo;
var getClosedLedger = functions.getClosedLedger;
var makePayment = functions.makePayment;
var initialFunding = functions.initialFunding;
var createNewAccount = functions.createNewAccount;

function randomPayment() {
  var length = fundedWallets.length;
  if(length <= 0) {
    // console.log(date() + 'No funded wallets available');
    return;
  }

  // doesn't need to be cryptographically secure
  // Note that we could potentially pick the same src and dest account.
  // That possibility is left intentionally (ie. What happens?)
  var srcIndex = Math.floor(Math.random() * length);
  var src = fundedWallets[srcIndex];
  var destIndex = Math.floor(Math.random() * length);
  var dest = fundedWallets[destIndex]

  var payment = Math.floor(Math.random() * ( paymentmax - paymentmin )) 
    + paymentmin;

  makePayment(src, dest, Amount.from_human(payment + 'XRP'));
}

//function updateKnownWallets()
//{
//    var ledgerRequest = getClosedLedger( { expand: true } );
//    ledgerRequest.on('success', function onSuccess(res) {
//      var updatedWallets = [];
//      for(var i = 0; i < res.ledger.accountState.length; i++) {
//        var acct = res.ledger.accountState[i];
//        if( acct.LedgerEntryType == 'AccountRoot' ) {
//          updatedWallets.push(acct.Account);
//        }
//      }
//      console.out('Replacing list of ' + knownWallets.length
//        + ' known wallets with updated list of ' + updatedWallets.length);
//      knownWallets.set(updatedWallets);
//    });
//}

function createAccount(num)
{
  // Create accounts up to the limit
  if ( num < expectedAccounts ) {
    var account = createNewAccount(fundingmin, fundingmax);
    account.fundingTransaction.setMaxListeners(expectedAccounts);
    // Use the 'propsed' event to keep things asynchronous
    account.fundingTransaction.on('proposed', function() {
      createAccount( num + 1 );
    });
    account.fundingTransaction.on('success', function(res) {
      console.log(date() + 'Funded accounts: ' + fundedWallets.length);
      console.log(prefix + 'Created accounts: ' + wallets.length);
    });
  } else {
    // Once all the accounts are created (or at least queued),
    // start making payments
    setInterval(function() {
      randomPayment();
    }, 1000);
  }
}

// TODO: Add a listener for updated ledger. Count the number of transactions in
// that ledger. Calculate time since last ledger. Divide to get transactions per
// second.

remote.once('connect', function() {

  /* remote connected */
  getAccountInfo(rootAccount.address);
  //updateKnownWallets();

  setInterval(function() {
    remote.ledger_accept();
  }, 2500);

//  setInterval(function() {
//    updateKnownWallets();
//  }, 60000);

  // start creating accounts
  createAccount(0);

//  // First create the accounts
//  //setInterval(function() {
//  for(var i = 0; i < expectedAccounts; i++) {
//    var account = createNewAccount(fundingmin, fundingmax);
//    account.fundingTransaction.setMaxListeners(expectedAccounts * 10);
//  }
//  //}, 4000);

//  setTimeout(function() {
//    remote.disconnect();
//  }, 30000);
});
remote.on('disconnect', function() {
  console.log(date() + 'Disconnect');
  process.exit();
});
remote.connect();


