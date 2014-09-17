//
// Configuration for performance tests: to be locally customized as needed.
//

// Use all generated wallets. Set to a positive value to use that limit.
exports.walletLimit = 0;

// Same parameters that are passed to Remote constructor.
// https://github.com/ripple/ripple-lib/blob/develop/docs/REFERENCE.md#remote-options
exports.remoteParams = [
  {
    //trace: true,
    trusted: true,
    servers: [ 'ws://127.0.0.1:6006' ]
  }
];
