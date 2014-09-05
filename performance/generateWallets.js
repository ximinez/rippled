/*
 * This is strictly intended to be a code generator.
 *
 * Usage: node performance/generateWallets.js > performance/wallets.js
 *
 * wallets.js can then be included with
 * require('./wallets.js');
 */
var Wallet = require('ripple-lib').Wallet;

var expected = 300000;
var wallets = [];

for( var i = 0 ; i < expected; i++) {
  var wallet = Wallet.generate();
  wallets.push(wallet);
}

console.log( 'var wallets = ' );
console.log( wallets );
console.log( ';' );
console.log( 'exports.wallets = wallets;' );
