var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;
var Wallet = require('ripple-lib').Wallet;
var extend = require('extend');

var wallets = [];
exports.wallets = wallets;
var fundedWallets = [];
exports.fundedWallets = fundedWallets;
var prefix = '   ';
exports.prefix = prefix;

// The canonical root account. Assume for now that on a test network, 
// it will have sufficient XRP to fund new accounts.
var rootAccount = {
  address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
  secret: 'snoPBrXtMeMyMHUVTgbuqAfg1SUTb'
};
exports.rootAccount = rootAccount;

// create a remote
var remote = new Remote({
  // see the api reference for available options
  //trace: true,
  trusted: true,
  servers: [ 'ws://127.0.0.1:6006' ]
});
remote.setSecret(rootAccount.address, rootAccount.secret);

exports.remote = remote;

function date() {
  return '\n' + new Date().toISOString() + ' ';
}
exports.date = date;

var errorHandler = function onError(err) {
  console.log(date() + 'Error');
  console.log(err);
  remote.disconnect();
  setTimeout(function() { remote.disconnect(); }, 100);
};
exports.errorHandler = errorHandler;

function getAccountInfo(address) {
  var accountinfo = remote.request('account_info', {
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

function getLedger(ledger_index, opts, callback) {
  opts = opts || {};
  var ledger = remote.request('ledger', null, opts).ledger_index(ledger_index);

  ledger.on('error', errorHandler);

  if(callback) {
    callback(ledger);
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
  var ledger = remote.request('ledger', null, opts).ledger_index("closed");

  ledger.on('error', errorHandler);

  ledger.request();

  return ledger;
}
exports.getClosedLedger = getClosedLedger;

function transactionTimeout(label) {
  return setTimeout(function() {
    console.log(date() + 'Timeout ' + label);
    remote.disconnect();
    process.exit(1);
  }, 30000)
}

function makePayment(srcAddress, destAddress, amount) {
  var transaction = remote.createTransaction('Payment', {
    account: srcAddress,
    destination: destAddress,
    amount: amount
  });
  var label = 'from ' + srcAddress
      + ' to ' + destAddress
      + ' for ' + amount.to_human_full();
  var timeoutId = transactionTimeout(label);

  transaction.on('proposed', function() {
    console.log(date() + 'Payment transaction queued ' + label);
    // remote.ledger_accept();
  });
  transaction.on('missing', function() {
    console.log(date() + 'Payment is missing ' + label);
  });
  transaction.on('error', function(err) {
    console.log(date() + 'Payment failed for ' + label);
    console.log(prefix + 'Result: ' + err.engine_result);
    console.log(prefix + 'Result code: ' + err.engine_result_code);
    console.log(prefix + 'Result message: ' + err.engine_result_message);
    console.log(prefix + 'Source Account: ' + err.tx_json.Account);
    console.log(prefix + 'Dest Account: ' + err.tx_json.Destination);
    console.log(prefix + 'Amount: ' 
      + Amount.from_json(err.tx_json.Amount).to_human_full());
    console.log(prefix + 'Fee: ' + err.tx_json.Fee);
    console.log(prefix + 'Transaction Type: ' + err.tx_json.TransactionType);
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
  transaction.submit(function(res, err) {
    // clear the timeout no matter what
    clearTimeout(timeoutId);
  });

  return transaction;
}
exports.makePayment = makePayment;

function makeTrustLine(trusterAddress, limit) {
  var transaction = remote.createTransaction('TrustSet', {
    account: trusterAddress,
    limit: limit
  });
  var label = 'from ' + trusterAddress
      + ' for ' + limit.to_human_full();
  var timeoutId = transactionTimeout(label);

  transaction.on('proposed', function() {
    console.log(date() + 'Trust line transaction queued ' + label);
    // remote.ledger_accept();
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
  transaction.submit(function(res, err) {
    // clear the timeout no matter what
    clearTimeout(timeoutId);
  });

  return transaction;
}
exports.makeTrustLine = makeTrustLine;

//function makeOffer(sellAddress, sellAmount, buyAmount, expiration) {
//  var transaction = remote.createTransaction('OfferCreate', {
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
//    // remote.ledger_accept();
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

function initialFunding(destAddress, fundingmin, fundingmax) {
  // doesn't need to be cryptographically secure
  var funding = Math.floor(Math.random() * ( fundingmax - fundingmin )) 
    + fundingmin;
  // Send some money from default account to my new account
  var transaction = makePayment(rootAccount.address, destAddress,
      Amount.from_human(funding + 'XRP'));

  transaction.on('success', function(res) {
    fundedWallets.push(res.tx_json.Destination);
    getAccountInfo(destAddress);
  });

  return transaction;
}
exports.initialFunding = initialFunding;

function createNewAccount(fundingmin, fundingmax) {
  var wallet = Wallet.generate();
  console.log(date() + 'New wallet: ' + wallet.address);
  console.log(prefix + 'Secret key: ' + wallet.secret);
  wallets.push(wallet);
  remote.setSecret(wallet.address, wallet.secret);

  return {
    wallet: wallet,
    fundingTransaction: initialFunding(wallet.address, fundingmin, fundingmax),
  };
}
exports.createNewAccount = createNewAccount;

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

