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

var fundingmin = 10000;
var fundingmax = 10000000;
var paymentmin = 1;
var paymentmax = 100000;

var getAccountInfo = functions.getAccountInfo;
var makePayment = functions.makePayment;
var initialFunding = functions.initialFunding;
var createNewAccount = functions.createNewAccount;

function randomPayment() {
  var length = fundedWallets.length;
  if(length <= 0) {
    // console.log('\nNo funded wallets available');
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

remote.once('connect', function() {
  /* remote connected */
  getAccountInfo(rootAccount.address);

  remote.setSecret(rootAccount.address, rootAccount.secret);

  setInterval(function() {
    createNewAccount(fundingmin, fundingmax);
  }, 4000);

  setInterval(function() {
    randomPayment();
  }, 1000);

  setInterval(function() {
    remote.ledger_accept();
  }, 2500);

//  setTimeout(function() {
//    remote.disconnect();
//  }, 30000);
});
remote.on('disconnect', function() {
  console.log('Disconnect');
  process.exit();
});
remote.connect();


