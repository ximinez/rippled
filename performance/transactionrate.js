/*
We need this functionality for test network scripts:
1. Create 300,000 accounts
2. Figure out how many tx/sec total is possible for these accounts
3. Initial tx set will be just xrp transfers
4. Subsequent version will submit order book tx and determine the tx/sec possible for order book tx

"Figure out" means try shorter intervals until a failure occurs.
*/

var fundingmin = 300;
var fundingmax = 10000;
var paymentmin = 1;
var paymentmax = 1000;

/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;
var functions = require('./functions');
var wallets = require('./wallets').wallets;
// Work with a subset
wallets.length = 1000;
var flowControl = require('./flowControl').flowControl;

var remote = functions.remote;
var errorHandler = functions.errorHandler;
var rootAccount = functions.rootAccount;
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
    return null;
  }

  console.log(date() + 'Funded accounts: ' + fundedWallets.length);
  console.log(prefix + 'Created accounts: ' + wallets.length);

  // doesn't need to be cryptographically secure
  // Note that we could potentially pick the same src and dest account.
  // That possibility is left intentionally to exercise the temREDUNDANT
  // case
  var srcIndex = Math.floor(Math.random() * length);
  var src = fundedWallets[srcIndex];
  var destIndex = Math.floor(Math.random() * length);
  var dest = fundedWallets[destIndex]

  var payment = Math.floor(Math.random() * ( paymentmax - paymentmin )) 
    + paymentmin;
  var amount = Amount.from_human(payment + 'XRP');

  console.log(date() + 'Payment from wallet ' + srcIndex + ': ' + src
    + ' to wallet ' + destIndex + ': ' + dest
    + ' for ' + amount.to_human_full());
  var transReq = makePayment(src, dest, amount);
//  transReq.on('error', function onRandomPaymentError(err) {
//    if(err.engine_result == '') {
//      fundAccount(srcIndex);
//    }
//  });
  transReq.on('timeout', function(err) {
    // Abort this request. This will trigger a tejAbort error, which
    // will cause the request to requeue.
    // ripple-lib retries, too, but in the case of a timeout, I want
    // to take control.
    console.log(date() + 'TIMEOUT!');
    console.log(err);
    this.abort();
  });
  var result = {
    payload: transReq
  };
  return result;
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

function fundAccount(num)
{
  var result;

  // Create accounts up to the limit
  if ( num < wallets.length ) {
    var wallet = wallets[num];
    console.log(date() + 'Funding wallet #' + num + ': ' + wallet.address);

    remote.setSecret(wallet.address, wallet.secret);
    var fundingReq = initialFunding(wallet.address, fundingmin, fundingmax);

    result = {
      next: function fundNext() {
        return fundAccount(num + 1);
      },
      payload: fundingReq
    };

    fundingReq.on('success', function(res) {
      console.log(date() + 'Funded accounts: ' + fundedWallets.length);
      console.log(prefix + 'Created accounts: ' + wallets.length);
    });
    fundingReq.on('timeout', function(err) {
      // Abort this request. This will trigger a tejAbort error, which
      // will cause the request to requeue.
      // ripple-lib retries, too, but in the case of a timeout, I want
      // to take control.
      console.log(date() + 'TIMEOUT!');
      console.log(err);
      this.abort();
    });
  } else {
    // Once all the accounts are created (or at least queued),
    // start making payments
    console.log(date() + 'All wallets are funded. Start random transactions.');
    result = {
      next: randomPayment
    };
  }

  return result;
}

function foundFirstUnfundedWallet(wallets, firstUnfunded) {
  console.log(date() + 'First unfunded wallet is at ' + firstUnfunded);
  for( var i = 0 ; i < firstUnfunded; ++i ) {
    var wallet = wallets[i];
    fundedWallets.push(wallet.address);
  }

  flowControl( function fundFirst() {
    return fundAccount(firstUnfunded);
  });
}

function findFirstUnfundedWallet(wallets, search) {
  if(!search) {
    search = {
      first: 0,
      last: wallets.length - 1
    };
    search.range = {
      begin: search.first,
      middle: 0,
      end: search.last
    };
  }
  search.range.middle = Math.floor((search.range.begin + search.range.end) / 2);
  console.log(date());
  console.log(search);

  /*
    Use a modified binary search to find the _first_ unfunded wallet.
    Can't use a standard binary search because we're not looking for
    a specific item.
    Basic algorithm:
    1) Given a range, test the middle item.
    2) If a funded account is found
    2a) If middle == end, final result is middle+1, which should indicate
        all wallets are funded
    2b) If begin == middle, then end == middle+1, and result is middle+1,
        which could be any index.
    2c) Else the new range becomes [middle+1, end]
    3) If an unfunded account is found (or funded account is not found)
    3a) If begin == middle, then the final result is middle.
    3b) Else the new range becomes [begin, middle].

    This may result in duplicated tests, because we may find the first
    more than once before we realize it's the first.
  */

  var testAddress = wallets[search.range.middle].address;
  var request = getAccountInfo(testAddress);
  request.removeListener('error', errorHandler);
  request.on('success', function foundFunded(res) {
    console.log(date() + 'Wallet found ' + testAddress);
    if( res.account_data.Account != testAddress) {
      // Something unexpected happened. Abort.
      console.log(res);
      remote.disconnect();
    }
    if( search.range.middle == search.range.end 
      || search.range.begin == search.range.middle ) {
      var result = search.range.middle + 1;
      foundFirstUnfundedWallet( wallets, result );
    } else {
      search.range.begin = search.range.middle + 1;
      findFirstUnfundedWallet(wallets, search);
    }
  });
  request.on('error', function foundUnfunded(err) {
    console.log(date() + 'Wallet not found ' + testAddress);
    if( err.error != 'remoteError' 
      || err.remote.error != 'actNotFound' 
      || err.remote.account != testAddress) {
      // Something unexpected happened. Abort.
      console.log(err);
      remote.disconnect();
    }
    if( search.range.begin == search.range.middle ) {
      var result = search.range.middle;
      foundFirstUnfundedWallet( wallets, result );
    } else {
      search.range.end = search.range.middle;
      findFirstUnfundedWallet(wallets, search);
    }
  });
}

// TODO: Add a listener for updated ledger. Count the number of transactions in
// that ledger. Calculate time since last ledger. Divide to get transactions per
// second.

remote.once('connect', function() {

  // go for broke.
  remote.setMaxListeners(wallets.length);
  
  for( var i = 0 ; i < wallets.length; ++i ) {
    var wallet = wallets[i];
    remote.setSecret(wallet.address, wallet.secret);
  }

  /* remote connected */
  getAccountInfo(rootAccount.address);

  // In case there's anything pending in the ledger, push it through now.
  remote.ledger_accept(function() {
    findFirstUnfundedWallet(wallets);
  });

  //updateKnownWallets();

//  setInterval(function() {
//    updateKnownWallets();
//  }, 60000);


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


