var functions = require('./functions');

var date = functions.date;

console.log(date() + 'CHILD on message');
process.on('message', function(m) {
  console.log(date() + 'CHILD got message:', m);

  console.log(date() + 'CHILD send message');
  this.send({ response: 'I got your message' });
  console.log(date() + 'CHILD done send message');

  var start = new Date();
  while( ( new Date() - start ) < 5000 ) {
  }

  console.log(date() + 'CHILD done processing message');
});
