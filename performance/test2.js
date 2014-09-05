/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;

/* Loading ripple-lib in a webpage */
// var Remote = ripple.Remote;

var remote = new Remote({
  // see the API Reference for available options
  //trace: true,
  servers: [ 'ws://127.0.0.1:6006' ]
});

var accountinfo = remote.request('account_info', {
  account: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
});

accountinfo.on('success', function onSuccess(res) {
  console.log('Success');
  console.log(res);
  remote.disconnect();
});

accountinfo.on('error', function onError(err) {
  console.log('Error');
  console.log(err);
  remote.disconnect();
});

remote.once('connect', function() {
  /* remote connected */
  accountinfo.request();

});
remote.connect();

