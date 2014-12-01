var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;
var Wallet = require('ripple-lib').Wallet;
var extend = require('extend');
var child_process = require('child_process');

var fundedWallets = [];
exports.fundedWallets = fundedWallets;
var prefix = '   ';
exports.prefix = prefix;

function get_config() {
  // Stolen from ../test/testutils.js
  var cfg = require(__dirname + '/config-example');

  // Load the custom config if any
  try {
    cfg = extend({}, cfg, require(__dirname + '/config'));
  } catch(e) {
    // ignore exceptions - fall back to the default
  }

  return cfg;
}

var config = get_config();

exports.config = config;

function getGeneratedWallets(limit) {
  var wallets = require('./wallets').wallets;

  // Work with a subset of the wallets if specified in the config
  limit = limit || config.walletLimit;
  if( limit ) {
    wallets.length = limit;
  }

  return wallets;
}

exports.getGeneratedWallets = getGeneratedWallets;

// The canonical root account. Assume for now that on a test network, 
// it will have sufficient XRP to fund new accounts.
var rootAccount = {
  address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
  secret: 'snoPBrXtMeMyMHUVTgbuqAfg1SUTb'
};
exports.rootAccount = rootAccount;

var remotes = new Array(config.remoteParams.length);
for(var i = 0; i < config.remoteParams.length; ++i) {
  // create a remote
  var remote = new Remote(config.remoteParams[i]);
  remote.setSecret(rootAccount.address, rootAccount.secret);

  remotes[i] = remote;
}

exports.remotes = remotes;
// Backward compatibility:
exports.remote = remotes[0];

var lastRemote = -1;
function roundRobinRemote() {
  lastRemote = ( lastRemote + 1 ) % remotes.length;

  var remote = remotes[lastRemote];

  return remote;
}

exports.roundRobinRemote = roundRobinRemote;

/* hack */
function connectRemotes() {
  for(var i = 0; i < remotes.length; ++i) {
    remotes[i].connect();
  }
}

exports.connectRemotes = connectRemotes;

function getRemoteAddress(myRemote) {
  myRemote = myRemote || remote;
  var address = myRemote._servers[0]._opts.url;
  return address;
}
exports.getRemoteAddress = getRemoteAddress;

function date() {
  return '\n' + new Date().toISOString() + ' ';
}
exports.date = date;

var errorHandler = function onError(err) {
  console.log(date() + 'Error');
  console.log(err);
  for(var i = 0; i < remotes.length; ++i) {
    remotes[i].disconnect();
    (function(i) {
      var j = i;
      setTimeout(function() { remotes[j].disconnect(); }, 100);
    })();
  }
};
exports.errorHandler = errorHandler;

function spawnWorker() {
  var child = child_process.fork(__dirname + '/workerProc.js');
  child.on('exit', function(code, signal) {
    console.log(date() + 'worker process exited', code, signal);
  });
  return child;
}
exports.spawnWorker = spawnWorker;

function getAccountInfo(address) {
  var accountinfo = roundRobinRemote().request('account_info', {
    account: address
  });

  accountinfo.on('success', function onSuccess(res) {
    console.log(date() + 'Account info: ' + res.account_data.Account);
    console.log(prefix + 'Balance: ' + res.account_data.Balance);
    console.log(prefix + 'Trust lines and offers: '
      + res.account_data.OwnerCount);
    console.log(prefix + 'Ledger Index: ' + res.account_data.PreviousTxnLgrSeq);
    // console.log(res);
  });

  accountinfo.on('error', errorHandler);

  accountinfo.request();

  return accountinfo;
};
exports.getAccountInfo = getAccountInfo;

/*
 * myRemote is last so it can be optional. It probably shouldn't be.
 */
function getLedger(ledger_index, opts, callback, myRemote) {
  opts = opts || {};
  myRemote = myRemote || roundRobinRemote();
  var ledger = myRemote.request('ledger', opts).ledger_index(ledger_index);

  ledger.on('error', errorHandler);

  if(callback) {
    callback(ledger, myRemote);
  }

  ledger.request();

  return ledger;
}
exports.getLedger = getLedger;

function getClosedLedger(opts) {
  opts = opts || {};
  extend( opts, {
    accounts: true,
  });
  var ledger = roundRobinRemote().request('ledger', null, opts).ledger_index("closed");

  ledger.on('error', errorHandler);

  ledger.request();

  return ledger;
}
exports.getClosedLedger = getClosedLedger;

function acceptLedger(ledgerAcceptedCallback, completeLedgerCallback) {
  var startTime = new Date();
  var request = remote.ledger_accept();
  request.once('ledger_closed', function(ledger) {
    var ledgerRequest = ledgerAccepted(remote, startTime, ledger,
      completeLedgerCallback);
    if(ledgerAcceptedCallback) {
      ledgerAcceptedCallback(startTime, ledger, ledgerRequest, remote);
    }
  });
  return request;
}
exports.acceptLedger = acceptLedger;

function monitorLedger(myRemote) {
  var currentTime = new Date();
  var trackLedgers = false;
  var expectedLedger = 0;

  var myRemote = myRemote || remote;

  function startTracking(ledger) {
    currentTime = new Date();
    trackLedgers = true;
    expectedLedger = ledger.ledger_index + 1;
  }

  myRemote.on('ledger_closed', function(ledger) {
    console.log(date() + 'Got ledger number ' + ledger.ledger_index
      + ' from ' + getRemoteAddress(myRemote));
    if( !trackLedgers || !expectedLedger ) {
      console.log(prefix + 'First ledger. Start stat collection.');
      startTracking(ledger);
    } else if( ledger.ledger_index < expectedLedger ) {
      console.log(prefix + 'Ledger out of order. Expected ' + expectedLedger
        + '. Ignore, and stop stat collection until we catch up.');
      trackLedgers = false;
    } else if( ledger.ledger_index > expectedLedger ) {
      console.log(prefix + 'Ledgers were skipped. Expected ' + expectedLedger
        + '. Ignore, and restart stat collection.');
      startTracking(ledger);
    } else if( !trackLedgers ) {
      console.log(prefix + 'Ledger sequence is back on track.'
        + ' Resume stat collection.')
      startTracking(ledger);
    } else {
      //console.log(ledger);
      console.log(prefix + 'Retrieving ledger');
      var ledgerRequest = ledgerAccepted(myRemote, currentTime, ledger);
      startTracking(ledger);
    }
  });
}
exports.monitorLedger = monitorLedger;

function ledgerAccepted(myRemote, startTime, ledger, completeLedgerCallback) {
  var endTime = new Date();
  // console.log(date() + 'start time: ' + startTime.toISOString());
  // console.log(prefix + 'end time: ' + endTime.toISOString());
  // console.log(prefix + 'duration: ' + (endTime - startTime) + 'ms');
  // console.log(ledger);
  
  var ledgerReq = getLedger(ledger.ledger_index,
    {
      transactions: true,
    },
    function callback(ledger, myRemote) {
      ledger.once('success', function gotLedger(fullLedger) {
        completeLedger(myRemote, startTime, endTime, fullLedger);
        if(completeLedgerCallback) {
          completeLedgerCallback(startTime, endTime, fullLedger, myRemote);
        }
      });
    },
    myRemote
  );
  return ledgerReq;
}

function completeLedger(myRemote, startTime, endTime, fullLedger) {
  var duration = endTime - startTime;
  var transactionCount = fullLedger.ledger.transactions.length;
  var rate;
  if(duration != 0) {
    rate = transactionCount / duration * 1000;
  } else {
    rate = 'INFINITE';
  }

  var address = getRemoteAddress(myRemote);

  var testStatsLong = '';
  var testStats = '';
  if(globalTestRepParams) {
    testStats = '\t' + globalTestRepParams.testSize;
    testStats += '\t' + globalTestRepParams.testNumber;
    // race condition if multithreaded
    testStats += '\t' + globalTestRepParams.txnsSent;
    testStatsLong = 'test #' + globalTestRepParams.testNumber 
      + ' test size ' + globalTestRepParams.testSize
      + ' since last ledger, sent ' + globalTestRepParams.txnsSent
      + ' ';
    globalTestRepParams.txnsSent = 0;
  }
  console.log(date() + 'ledger_accept for ledger #' +
    fullLedger.ledger.ledger_index + ' took ' + duration 
    + 'ms to process ' + transactionCount + ' transactions. '
    + rate + ' transactions/second. (' + testStatsLong
    + '@' + address + ')');
  console.log(date().trim() + '\t' + duration + '\t' + transactionCount
    + '\t' + rate + '\t' + fullLedger.ledger.ledger_index
    + testStats // includes its own delimiter
    + '\t' + address);
}



//function transactionTimeout(label) {
//  return setTimeout(function() {
//    console.log(date() + 'Timeout ' + label);
//    // remote.disconnect();
//    // process.exit(1);
//  }, 30000)
//}

function makePaymentTransaction(srcAddress, destAddress, amount) {
  var transaction = roundRobinRemote().createTransaction('Payment', {
    account: srcAddress,
    destination: destAddress,
    amount: amount
  });
  var label = 'from ' + srcAddress
      + ' to ' + destAddress
      + ' for ' + amount.to_human_full();
  // var timeoutId = transactionTimeout(label);

  transaction.on('proposed', function() {
    console.log(date() + 'Payment transaction queued ' + label);
  });
  transaction.on('missing', function() {
    console.log(date() + 'Payment is missing ' + label);
  });
  transaction.on('error', function(err) {
    console.log(date() + 'Payment failed for ' + label);
    console.log(prefix + 'Result: ' + err.engine_result);
    console.log(prefix + 'Result code: ' + err.engine_result_code);
    console.log(prefix + 'Result message: ' + err.engine_result_message);
    if( err.tx_json ) {
      console.log(prefix + 'Source Account: ' + err.tx_json.Account);
      console.log(prefix + 'Dest Account: ' + err.tx_json.Destination);
      console.log(prefix + 'Amount: ' 
        + Amount.from_json(err.tx_json.Amount).to_human_full());
      console.log(prefix + 'Fee: ' + err.tx_json.Fee);
      console.log(prefix + 'Transaction Type: ' + err.tx_json.TransactionType);
    }
    if(err.engine_result != 'temREDUNDANT') {
      console.log(err);
    }
  });
  transaction.on('success', function(res) {
    console.log(date() + 'Payment finished for ' + label);
    console.log(prefix + 'Result: ' + res.engine_result);
    console.log(prefix + 'Result code: ' + res.engine_result_code);
    console.log(prefix + 'Result message: ' + res.engine_result_message);
    console.log(prefix + 'Ledger index: ' + res.ledger_index);
    console.log(prefix + 'Status: ' + res.status);
    console.log(prefix + 'Type: ' + res.type);
    console.log(prefix + 'Validated: ' + res.validated);
    console.log(prefix + 'Source Account: ' + res.tx_json.Account);
    console.log(prefix + 'Dest Account: ' + res.tx_json.Destination);
    console.log(prefix + 'Amount: ' + res.tx_json.Amount);
    console.log(prefix + 'Fee: ' + res.tx_json.Fee);
    console.log(prefix + 'Transaction Type: ' + res.tx_json.TransactionType);
    console.log(prefix + 'Date: ' + res.tx_json.date);
  });

  return transaction;
}

exports.makePaymentTransaction = makePaymentTransaction;

function makePayment(srcAddress, destAddress, amount) {
  var transaction = makePaymentTransaction(srcAddress, destAddress, amount);

  transaction.submit(/*function(res, err) {
    // clear the timeout no matter what
    clearTimeout(timeoutId);
  }*/);

  return transaction;
}
exports.makePayment = makePayment;

function makeTrustLine(trusterAddress, limit) {
  var transaction = roundRobinRemote().createTransaction('TrustSet', {
    account: trusterAddress,
    limit: limit
  });
  var label = 'from ' + trusterAddress
      + ' for ' + limit.to_human_full();
  // var timeoutId = transactionTimeout(label);

  transaction.on('proposed', function() {
    console.log(date() + 'Trust line transaction queued ' + label);
  });
  transaction.on('missing', function() {
    console.log(date() + 'Trust line is missing ' + label);
  });
  transaction.on('error', function(err) {
    console.log(date() + 'Trust line failed for ' + label);
    console.log(prefix + 'Result: ' + err.engine_result);
    console.log(prefix + 'Result code: ' + err.engine_result_code);
    console.log(prefix + 'Result message: ' + err.engine_result_message);
    console.log(prefix + 'Source Account: ' + err.tx_json.Account);
    console.log(prefix + 'Dest Account: ' + err.tx_json.Destination);
    console.log(prefix + 'Amount: ' + err.tx_json.Amount);
    console.log(prefix + 'Fee: ' + err.tx_json.Fee);
    console.log(prefix + 'Transaction Type: ' + err.tx_json.TransactionType);
    if(err.engine_result != 'temREDUNDANT') {
      console.log(err);
    }
  });
  transaction.on('success', function(res) {
    console.log(date() + 'Trust line finished for ' + label);
    console.log(prefix + 'Result: ' + res.engine_result);
    console.log(prefix + 'Result code: ' + res.engine_result_code);
    console.log(prefix + 'Result message: ' + res.engine_result_message);
    console.log(prefix + 'Ledger index: ' + res.ledger_index);
    console.log(prefix + 'Status: ' + res.status);
    console.log(prefix + 'Type: ' + res.type);
    console.log(prefix + 'Validated: ' + res.validated);
    console.log(prefix + 'Source Account: ' + res.tx_json.Account);
    console.log(prefix + 'Limit: ' 
      + Amount.from_json(res.tx_json.LimitAmount).to_human_full());
    console.log(prefix + 'Fee: ' + res.tx_json.Fee);
    console.log(prefix + 'Transaction Type: ' + res.tx_json.TransactionType);
    console.log(prefix + 'Date: ' + res.tx_json.date);
    // console.log(res);
  });
  transaction.submit(/*function(res, err) {
    // clear the timeout no matter what
    clearTimeout(timeoutId);
  }*/);

  return transaction;
}
exports.makeTrustLine = makeTrustLine;

//function makeOffer(sellAddress, sellAmount, buyAmount, expiration) {
//  var transaction = roundRobinRemote().createTransaction('OfferCreate', {
//    account: sellAddress,
//    buy: buyAmount,
//    sell: sellAmount,
//    expiration: expiration
//  });
//  var sellText;
//  if(transaction.tx_json.
//  var label = 'from ' + srcAddress
//      + ' sell ' + sellAmount.to_human_full()
//      + ' buy ' + buyAmount.to_human_full()
//      + ' expires ' + expiration;
//  var timeoutId = transactionTimeout(label);
//
//  transaction.on('proposed', function() {
//    console.log(date() + 'Payment transaction queued ' + label);
//  });
//  transaction.on('missing', function() {
//    console.log(date() + 'Payment is missing ' + label);
//  });
//  transaction.on('error', function(err) {
//    console.log(date() + 'Payment failed for ' + label);
//    console.log(prefix + 'Result: ' + err.engine_result);
//    console.log(prefix + 'Result code: ' + err.engine_result_code);
//    console.log(prefix + 'Result message: ' + err.engine_result_message);
//    console.log(prefix + 'Source Account: ' + err.tx_json.Account);
//    console.log(prefix + 'Dest Account: ' + err.tx_json.Destination);
//    console.log(prefix + 'Amount: ' + err.tx_json.Amount);
//    console.log(prefix + 'Fee: ' + err.tx_json.Fee);
//    console.log(prefix + 'Transaction Type: ' + err.tx_json.TransactionType);
//    if(err.engine_result != 'temREDUNDANT') {
//      console.log(err);
//    }
//  });
//  transaction.on('success', function(res) {
//    fundedWallets.push(res.tx_json.Destination);
//    console.log(date() + 'Payment finished for ' + label);
//    console.log(prefix + 'Result: ' + res.engine_result);
//    console.log(prefix + 'Result code: ' + res.engine_result_code);
//    console.log(prefix + 'Result message: ' + res.engine_result_message);
//    console.log(prefix + 'Ledger index: ' + res.ledger_index);
//    console.log(prefix + 'Status: ' + res.status);
//    console.log(prefix + 'Type: ' + res.type);
//    console.log(prefix + 'Validated: ' + res.validated);
//    console.log(prefix + 'Source Account: ' + res.tx_json.Account);
//    console.log(prefix + 'Dest Account: ' + res.tx_json.Destination);
//    console.log(prefix + 'Amount: ' + res.tx_json.Amount);
//    console.log(prefix + 'Fee: ' + res.tx_json.Fee);
//    console.log(prefix + 'Transaction Type: ' + res.tx_json.TransactionType);
//    console.log(prefix + 'Date: ' + res.tx_json.date);
//    getAccountInfo(destAddress);
//  });
//  transaction.submit(function(res, err) {
//    // clear the timeout no matter what
//    clearTimeout(timeoutId);
//  });
//
//  return transaction;
//}
//exports.makeOffer = makeOffer;

function makeInitialFundingTransaction(destAddress, fundingmin, fundingmax) {
  // doesn't need to be cryptographically secure
  var funding = Math.floor(Math.random() * ( fundingmax - fundingmin )) 
    + fundingmin;
  // Send some money from default account to my new account
  var transaction = makePaymentTransaction(rootAccount.address, destAddress,
      Amount.from_human(funding + 'XRP'));

  return transaction;
}

exports.makeInitialFundingTransaction = makeInitialFundingTransaction;

function initialFunding(destAddress, fundingmin, fundingmax) {
  var transaction = makeInitialFundingTransaction(destAddress,
    fundingmin, fundingmax);

  transaction.on('success', function(res) {
    fundedWallets.push(res.tx_json.Destination);
    getAccountInfo(destAddress);
  });

  transaction.submit();

  return transaction;
}
exports.initialFunding = initialFunding;

function createNewAccount(fundingmin, fundingmax, wallets) {
  var wallet = Wallet.generate();
  console.log(date() + 'New wallet: ' + wallet.address);
  console.log(prefix + 'Secret key: ' + wallet.secret);
  if(wallets) {
    wallets.push(wallet);
  }
  for(var i = 0; i < remotes.length; ++i) {
    remotes[i].setSecret(wallet.address, wallet.secret);
  }

  return {
    wallet: wallet,
    fundingTransaction: initialFunding(wallet.address, fundingmin, fundingmax),
  };
}
exports.createNewAccount = createNewAccount;

/*
  Expected structure of params for this function to work:

  var params = config.performanceTest || {
    cycles: 25,
    startingsize: 1,
    factor: 2, 
    increment: 0,
    repetitionsPerCycle: 5,
  };
  params.testSize = params.startingsize;
  params.testCycle = 0;
  params.testRep = 0;
  params.testTxnNumber = 0;
  params.testTxnReady = 0;
  params.timeoutHandle undefined
  params.waitingForLedger undefined

  next must be a function that takes params as the first parameter,
  or null.
 */
function checkForAccept(next, params, myRemote) {
  myRemote = myRemote || remote;
  var standalone = myRemote._stand_alone;
  if( !standalone && !params.monitoringLedger ) {
    console.log(date() + 'Running on a network. Start monitoring the ledger');
    monitorLedger(myRemote);
    params.monitoringLedger = true;
  }
  if(params.testTxnNumber >= params.testSize) {
    //console.log(params);
    if(params.testTxnReady < params.testTxnNumber) {
      if( params.waitingForLedger ) {
        console.log(date() + "Waiting for ledger");
      } else {
        console.log(date() + "Waiting for "
          + (params.testTxnNumber - params.testTxnReady)
          + " more transactions to be acknowledged by rippled.");

        if(params.timeoutHandle) {
          clearTimeout(params.timeoutHandle);
          delete params.timeoutHandle;
        }
        params.timeoutHandle = setTimeout( function() {
          params.testTxnReady = params.testTxnNumber;
          delete params.timeoutHandle;
          console.log(date()
            + 'Gave up waiting for transactions to be acknowledged');
          setImmediate(checkForAccept, next, params, myRemote);
        }, 20000);
      }
    } else if (!params.waitingForLedger) {
      if(standalone) {
        _checkForAccept_doLedgerAccept(next, params, myRemote);
      } else {
        _checkForAccept_waitForLedger(next, params, myRemote);
      }
    }
    return true;
  }
  // console.log(date() + 'send more transactions');
  return false;
}
exports.checkForAccept = checkForAccept;

function _checkForAccept_doLedgerAccept(next, params, myRemote) {
  console.log(date() + "accept_ledger");
  if(params.timeoutHandle) {
    clearTimeout(params.timeoutHandle);
    delete params.timeoutHandle;
  }
  if(!myRemote.isConnected()) {
    var address = getRemoteAddress(myRemote);
    console.log(date() + 'next: Remote ' + address
      + ' is disconnected. Try again later.');
    setImmediate(checkForAccept, next, params, myRemote);
    return true;
  }

  var timeout = 10 * params.testSize;
  var hardTimeout = 2 * timeout;
  console.log(date() + 'Set timeout to ' + timeout);
  var timeoutHandle = setTimeout(function() {
      console.log(date()
      + 'acceptLedger hard timeout - internal request timeout failed.');
      if(params.waitingForLedger) {
        console.log(date() + 'Send more transactions.');
        startNextTestRep(next, params, myRemote);
      }
    }, hardTimeout);

  params.waitingForLedger = true;
  var ledgerRequest = acceptLedger(
    function ledgerAccepted(myRemote, startTime, ledger, ledgerRequest) {
      timeoutHandle = checkForAccept_ledgerAccepted(startTime,
        ledger, ledgerRequest, timeoutHandle, timeout, myRemote);
    },
    function completeLedger(startTime, endTime, fullLedger) {
      clearTimeout(timeoutHandle);
      if(params.waitingForLedger) {
        startNextTestRep(next, params, myRemote);
      }
    }
  );

  ledgerRequest.timeout(timeout, function() {
    clearTimeout(timeoutHandle);
    console.log(date() + 'acceptLedger timed out (callback).');
    if(params.waitingForLedger) {
      console.log(date() + 'Send more transactions.');
      startNextTestRep(next, params, myRemote);
    }
  });
  ledgerRequest.once('timeout', function() {
    clearTimeout(timeoutHandle);
    console.log(date() + 'acceptLedger timed out (event). Send more transactions.');
    if(params.waitingForLedger) {
      console.log(date() + 'Send more transactions.');
      startNextTestRep(next, params, myRemote);
    }
  });
}

function _checkForAccept_waitForLedger(next, params, myRemote) {
  console.log(date() + "wait For Ledger");
  if(params.timeoutHandle) {
    clearTimeout(params.timeoutHandle);
    delete params.timeoutHandle;
  }

  params.waitingForLedger = true;
  myRemote.once('ledger_closed', function(ledger) {
    if(params.waitingForLedger) {
      /*
      var address = getRemoteAddress(remote);

      console.log(date() + '\tTest size\t' + params.testSize + '\t\t'
        + ledger.ledger_index + '\t' + address);
      */
      startNextTestRep(next, params, this);
    }
  });
}

function checkForAccept_ledgerAccepted(startTime, ledger, ledgerRequest,
  timeoutHandle, timeout, myRemote) {
  myRemote = myRemote || roundRobinRemote();
  clearTimeout(timeoutHandle);
  console.log(date()
    + 'ledger_accept complete. Requesting ledger data.');
  timeoutHandle = setTimeout(function() {
      console.log(date()
        + 'ledger request timed out. Retry.');
      // Make another request
      var newLedgerReq = getLedger(ledger.ledger_index,
        { transactions: true, }, null, myRemote);
      newLedgerReq.once('success',
        function gotSecondLedger(fullLedger) {
          ledgerRequest.emit('success', fullLedger);
        });
      checkForAccept_ledgerAccepted(startTime, ledger, ledgerRequest,
        timeoutHandle, timeout, myRemote);
    }, timeout);
  return timeoutHandle;
}

var globalTestRepParams;
function startNextTestRep(next, params, myRemote) {
  myRemote = myRemote || remote;
  globalTestRepParams = params;
  ++params.testRep;
  params.testNumber = (params.testNumber || 0) + 1;
  if(params.repetitionsPerCycle
    && params.testRep >= params.repetitionsPerCycle) {
    if(params.factor)
      params.testSize *= params.factor;
    if(params.increment)
      params.testSize += params.increment;
    params.testRep = 0;
    params.testCycle++;
    if(params.cycles && params.testCycle >= params.cycles) {
      console.log(date() + 'All finished!');
      myRemote.disconnect();
      setImmediate(function () {
        console.log(date() + 'Exit ' + getRemoteAddress(myRemote));
        process.exit();
      });
      return;
    }
  }
  params.testTxnReady = 0;
  params.testTxnNumber = 0;
  params.waitingForLedger = false;
  if(next) {
    setImmediate(next, params);
  }
}
exports.startNextTestRep = startNextTestRep;

function reconnectRemote(remote) {
  ++numDisconnects;
  var address = getRemoteAddress(remote);
  console.log(date() + 'Disconnect ' + address + ' ' + numDisconnects);
  if(remote._should_connect) {
    console.log('Remote connection was dropped remotely.');
  } else {
    console.log('Remote was disconnected by ripple-lib.');
  }
  var servers = remote._servers;
  for(var i = 0; i < servers.length; i++) {
    if(servers[i]._shouldConnect)
      console.log('Server ' + i + ' connection was dropped remotely.');
    else
      console.log('Server ' + i + ' was disconnected by ripple-lib.');
  }

  remote.reconnect();
}

var numDisconnects = 0;
function reconnectOnDisconnect(remote, timeout) {
  timeout = timeout || 10000;

  reconnectRemote(remote);
  var address = getRemoteAddress(remote);

  var timeoutHandle = setTimeout( function() {
    setImmediate(function () {
      console.log(date() + 'Exit ' + address + ' ' + numDisconnects);
      process.exit();
    });
  }, timeout);

  remote.once('connect', function() {
    console.log(date() + 'Reconnected ' + getRemoteAddress(this) 
      + ' ' + numDisconnects);
    clearTimeout(timeoutHandle);
  });
}
exports.reconnectOnDisconnect = reconnectOnDisconnect;

var multiTimeoutHandle;
function reconnectOnDisconnectMulti(remotes, remote, timeout) {
  timeout = timeout || 10000;

  reconnectRemote(remote);
  var address = getRemoteAddress(remote);

  var allDisconnected = remotes.every(
    function disconnected(remote, index, array)
    {
      return !remote.isConnected();
    }
    );

  if(multiTimeoutHandle) {
    clearTimeout(multiTimeoutHandle);
  }
  if(allDisconnected) {
    multiTimeoutHandle = setTimeout( function() {
      setImmediate(function () {
        console.log(date() + 'Exit ' + address + ' ' + numDisconnects);
        process.exit();
      });
    }, timeout);
  } else {
    // innocuous operation
    multiTimeoutHandle = setTimeout( function() {
      console.log(date() + 'Remote ' + address
        + ' has been disconnected for ' 
        + timeout + 'ms. ' + numDisconnects);
    }, timeout);
  }

  remote.once('connect', function() {
    console.log(date() + 'Reconnected ' + getRemoteAddress(this)
      + ' ' + numDisconnects);
    if(multiTimeoutHandle) {
      clearTimeout(multiTimeoutHandle);
      multiTimeoutHandle = undefined;
    }
  });
}
exports.reconnectOnDisconnectMulti = reconnectOnDisconnectMulti;

// Trades
var tradeCurrencies = [
  'XRP',
  'BTC',
  'AED',
  'AFN',
  'ALL',
  'AMD',
  'ANG',
  'AOA',
  'ARS',
  'AUD',
  'AWG',
  'AZN',
  'BAM',
  'BBD',
  'BDT',
  'BGN',
  'BHD',
  'BIF',
  'BMD',
  'BND',
  'BOB',
  'BOV',
  'BRL',
  'BSD',
  'BTN',
  'BWP',
  'BYR',
  'BZD',
  'CAD',
  'CDF',
  'CHE',
  'CHF',
  'CHW',
  'CLF',
  'CLP',
  'CNY',
  'COP',
  'COU',
  'CRC',
  'CUC',
  'CUP',
  'CVE',
  'CZK',
  'DJF',
  'DKK',
  'DOP',
  'DZD',
  'EGP',
  'ERN',
  'ETB',
  'EUR',
  'FJD',
  'FKP',
  'GBP',
  'GEL',
  'GHS',
  'GIP',
  'GMD',
  'GNF',
  'GTQ',
  'GYD',
  'HKD',
  'HNL',
  'HRK',
  'HTG',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'IQD',
  'IRR',
  'ISK',
  'JMD',
  'JOD',
  'JPY',
  'KES',
  'KGS',
  'KHR',
  'KMF',
  'KPW',
  'KRW',
  'KWD',
  'KYD',
  'KZT',
  'LAK',
  'LBP',
  'LKR',
  'LRD',
  'LSL',
  'LTL',
  'LYD',
  'MAD',
  'MDL',
  'MGA',
  'MKD',
  'MMK',
  'MNT',
  'MOP',
  'MRO',
  'MUR',
  'MVR',
  'MWK',
  'MXN',
  'MXV',
  'MYR',
  'MZN',
  'NAD',
  'NGN',
  'NIO',
  'NOK',
  'NPR',
  'NZD',
  'OMR',
  'PAB',
  'PEN',
  'PGK',
  'PHP',
  'PKR',
  'PLN',
  'PYG',
  'QAR',
  'RON',
  'RSD',
  'RUB',
  'RWF',
  'SAR',
  'SBD',
  'SCR',
  'SDG',
  'SEK',
  'SGD',
  'SHP',
  'SLL',
  'SOS',
  'SRD',
  'SSP',
  'STD',
  'SVC',
  'SYP',
  'SZL',
  'THB',
  'TJS',
  'TMT',
  'TND',
  'TOP',
  'TRY',
  'TTD',
  'TWD',
  'TZS',
  'UAH',
  'UGX',
  'USD',
  'USN',
  'UYI',
  'UYU',
  'UZS',
  'VEF',
  'VND',
  'VUV',
  'WST',
  'XAF',
  'XAG',
  'XAU',
  'XBA',
  'XBB',
  'XBC',
  'XBD',
  'XCD',
  'XDR',
  'XOF',
  'XPD',
  'XPF',
  'XPT',
  'XSU',
  'XTS',
  'XUA',
  'XXX',
  'YER',
  'ZAR',
  'ZMW',
  'ZWL'
];
exports.tradeCurrencies = tradeCurrencies;

