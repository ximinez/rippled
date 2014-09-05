/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;
var Amount = require('ripple-lib').Amount;
var Wallet = require('ripple-lib').Wallet;
var functions = require('./functions');

var remote = functions.remote;
var getLedger = functions.getLedger;

remote.once('connect', function() {
  getLedger(11, { transactions: true, expand: true }, 
    function callback(ledger) {
      ledger.on('success', function onLedger(ledger) {
        console.log(ledger);
      });
    });

  setTimeout( function() { remote.disconnect(); }, 10000 );

});

remote.connect();
