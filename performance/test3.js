/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;
var Wallet = require('ripple-lib').Wallet;

/* Loading ripple-lib in a webpage */
// var Remote = ripple.Remote;

var remote = new Remote({
  // see the API Reference for available options
  //trace: true,
  trusted: true,
  servers: [ 'ws://127.0.0.1:6006' ]
});

var errorHandler = function onError(err) {
  console.log('Error');
  console.log(err);
  remote.disconnect();
  setTimeout(function() { remote.disconnect(); }, 100);
};

var rootAccount = {
  address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
  secret: 'snoPBrXtMeMyMHUVTgbuqAfg1SUTb'
};

function getAccountInfo(address) {
  var accountinfo = remote.request('account_info', {
    account: address
  });

  accountinfo.on('success', function onSuccess(res) {
    console.log('Success');
    console.log(res);
  });

  accountinfo.on('error', errorHandler);

  accountinfo.request();
};

var wallets = [];
var fundingmin = 10000;
var fundingmax = 10000000;

remote.once('connect', function() {
  /* remote connected */
  getAccountInfo(rootAccount.address);

  remote.setSecret(rootAccount.address, rootAccount.secret);

  var wallet = Wallet.generate();
  console.log(wallet);
  wallets.push(wallet);
  remote.setSecret(wallet.address, wallet.secret);

  // doesn't need to be cryptographically secure
  var funding = Math.floor(Math.random() * ( fundingmax - fundingmin )) 
    + fundingmin;
  // Send some money from default account to my new account
  var transaction = remote.createTransaction('Payment', {
    account: rootAccount.address,
    destination: wallet.address,
    amount: Amount.from_human(funding + 'XRP')
  });
  transaction.on('proposed', function() {
    console.log('Function transaction accepted for ' + wallet.address);
    remote.ledger_accept();
  });
  transaction.on('missing', function() {
    console.log('Funding for ' + wallet.address + ' is missing');
  });
  transaction.on('error', function(err) {
    console.log('Funding failed for ' + wallet.address);
    console.log(err);
  });
  transaction.on('success', function(res) {
    console.log('Funding finished for ' + wallet.address);
    console.log(res);
    getAccountInfo(wallet.address);
  });
  transaction.submit(function(err, res) {
    // Submission result
    if(err) {
      console.log('Transaction submission error');
      console.log(err);
    }
    if(res) {
      console.log('Transaction submission result');
      console.log(res);
    }
  });

  setTimeout(function() {
    console.log('Timeout');
    remote.disconnect();
  }, 30000);
});
remote.connect();


