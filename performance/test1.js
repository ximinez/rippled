/* Loading ripple-lib with Node.js */
var Remote = require('ripple-lib').Remote;

/* Loading ripple-lib in a webpage */
// var Remote = ripple.Remote;

var remote = new Remote({
  // see the API Reference for available options
  //trace: true,
  servers: [ 'ws://127.0.0.1:6006' ]
});

var serverinfo = remote.request('server_info');

serverinfo.on('success', function onSuccess(res) {
  console.log('Success');
  console.log(res);
  remote.disconnect();
});

serverinfo.on('error', function onError(err) {
  console.log('Error');
  console.log(err);
  remote.disconnect();
});

remote.once('connect', function() {
  /* remote connected */
  serverinfo.request();

});
remote.connect();

//remote.once('connect', function() {
//  var serverinfo = remote.request('server_info');
//
//  serverinfo.on('success', function onSuccess(res) {
//    console.log('Success');
//    console.log(res);
//    remote.disconnect();
//  });
//
//  serverinfo.on('error', function onError(err) {
//    console.log('Error');
//    console.log(err);
//    remote.disconnect();
//  });
//
//  /* remote connected */
//  serverinfo.request();
//
//});
//remote.connect();

//remote.connect(function() {
//  var serverinfo = remote.request('server_info');
//
//  serverinfo.on('success', function onSuccess(res) {
//    console.log('Success');
//    remote.disconnect();
//  });
//
//  serverinfo.on('error', function onError(err) {
//    console.log('Error');
//    remote.disconnect();
//  });
//
//  /* remote connected */
//  serverinfo.request();
//
//});

//remote.connect(function() {
//  /* remote connected */
//  remote.request('server_info', function(err, info) {
//    if (err) {
//      // todo: error
//      console.log('Error');
//    } else {
//      // todo: success
//      console.log('Success');
//    }
//    remote.disconnect();
//  });
//});
