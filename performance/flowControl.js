var functions = require('./functions');

var date = functions.date;

function flowControl(callback, flow) {
  /*
   * Very very VERY loosely base on TCP Reno flow control algorithm.
   *
   * callback must take no parameters.
   * callback should return
     {
       next: the next callback function. if not provided, 
        callback will be called again.
       payload: the Event Emitter that will be giving us the
        success, error, timeout events.
     }
     If callback returns null, or an object with neither next nor result,
     flowControl will consider the flow as complete and not attempt
     any more callbacks.
   */

  flow = flow || {
    control: {
      currentItem: 0,
      queueStart: 0,
      windowSize: 1,
      slowStartThreshold: 0,
      lastTimeout: -1,
    },
    stats: {
      sent: 0,
      success: 0,
      timeouts: 0,
      errors: 0,
      retransmits: 0,
    },
    queue: {},
    next: [],
    pendSuccess: {},
    pendRetry: {},
    startTime: new Date(),
    emitterKeyField: "flowControlMetaData",
    intervalID: setInterval(function periodicKick() {
      flowControlKick(flow);
    }, 5000),
  };
  // flowLog('startup', flow);
  /*
   * Success:
     if( slowStartThreshold > 1 && windowSize < slowStartThreshold )
       windowSize += 1;
     else
       windowSize += 1 / windowSize
   * Fast retransmit - because rippled is not speaking TCP, it won't send
   * duplicate ACKs. Instead, we'll track how many successes come from later
   * requests.
     if( successIndex != min( queue.keys ) )
     {
      foreach( var key in queue.keys )
      {
        if (key < successIndex) {
          queue[key].duplicates++;
          if( queue[key].duplicates > 3 ) {
            retransmit( queue[key] ) ?
            windowSize = Math.ceil( windowSize / 2 );
          }
      }
     }
   * Timeout:
     slowStartThreshhold = Math.ceil(windowSize / 2);
     windowSize = 1;
   * Error - rippled can return errors, but TCP generally doesn't (no NACKs).
   * Idea: treat an error result as a fast retransmit, don't bother with the
   * overhead of tracking "duplicate ACKs".
   *
   * Also, we want to avoid retransmisions without confirmation from ripple-lib.
   */
  //
  // Check for any stuck items in the queue
  if( flow.queue[flow.control.queueStart] ) {
    console.log(date() + 'Waiting on item #' + flow.control.queueStart);
    var waitingItem = flow.queue[flow.control.queueStart];

    var lastEvent = waitingItem[flow.emitterKeyField].lastEvent;
    console.log(date() + 'Last event was at ' + lastEvent);
    var now = new Date();
    if (now - lastEvent > 15000) {
      waitingItem.emit('timeout', { result_message: 'No recent events' });
    }
  }

  if( ! callback ) {
    // flowLog('need callback', flow);
    callback = flow.next.shift();
  }
  while( (typeof callback == 'function')
    && flow.control.queueStart + flow.control.windowSize 
      > flow.control.currentItem) {

    // flowLog('callback', flow);

    var packet = callback();

    if(!packet || (!packet.next && !packet.payload)) {
      // flow is complete
      callback = null;
      flow.control.windowSize = 0;
      break;
    }

    if(packet.payload) {
      // console.log("packet has a result");
      var emitter = packet.payload;
      var queueKey = flow.control.currentItem;
      ++flow.stats.sent;
      ++flow.control.currentItem;

      while( typeof emitter[flow.emitterKeyField] != 'undefined' ) {
        flow.emitterKeyField += 'X';
      }
      flowControlSetupEmitter(flow, emitter, queueKey, callback);
    }

    if(typeof packet.next == 'function') {
      // console.log("packet has a next callback");
      // console.log(packet.next);
      callback = packet.next;
    }

  }

  if( typeof callback == 'function' )
  {
    // Hold on to the callback for next time.
    // If I did this right, one of the events will trigger this.
    // flowLog('hold callback', flow);
    flow.next.push( callback );
    // console.log(flow.next);
  }
}

function flowControlKick(flow) {
  console.log(date() + 'Kick');
  flowControl(null, flow);
}

function flowControlSetupEmitter(flow, emitter, queueKey, callback) {
  var reason = flow.queue[queueKey] ? 'requeued' : 'queued';
  var now = new Date();
  emitter[flow.emitterKeyField] = {
    queueKey: queueKey,
    callback: callback,
    created: now,
    lastEvent: now
  };
  flow.queue[queueKey] = emitter;

  emitter.on('success', function onSuccess(res) {
    var queueKey = this[flow.emitterKeyField].queueKey;
    flowControlSuccess('success', flow, this, queueKey, res);
  });
//  emitter.on('missing', function onMissing(res) {
//    var queueKey = this[flow.emitterKeyField].queueKey;
//    flowControlFastRetransmit('missing', flow, this, queueKey, res);
//  });
  emitter.on('timeout', function onTimeout(res) {
    var queueKey = this[flow.emitterKeyField].queueKey;
    flowControlTimeout('timeout', flow, this, queueKey, res);
  });
//  emitter.on('abort', function onAbort(res) {
//    var queueKey = this[flow.emitterKeyField].queueKey;
//    flowControlError('abort', flow, this, queueKey, res);
//  });
//  emitter.on('lost', function onLost(res) {
//    var queueKey = this[flow.emitterKeyField].queueKey;
//    flowControlFastRetransmit('lost', flow, this, queueKey, res);
//  });
  emitter.on('error', function onError(err) {
    var queueKey = this[flow.emitterKeyField].queueKey;
    flowControlError('error', flow, this, queueKey, err);
  });

  flowLog(reason, flow, queueKey);
}

function flowControlSuccess(reason, flow, emitter, queueKey, res) {
  /*
   * Success:
     if( slowStartThreshold > 1 && windowSize < slowStartThreshold )
       windowSize += 1;
     else
       windowSize += 1 / windowSize
   */
  if( flow.control.lastTimeout == queueKey ) {
    // This "packet" has previously timed out.
    flowControlTimeout(reason, flow, emitter, queueKey, res);
  }
  if( queueKey <= flow.control.queueStart ) {
    // Only advance when the first item completes. If this isn't the first
    // item, hold on to the confirmation.
    // (Should never be less, but work around oddities so we don't get stuck)

    // Update the flow tracking
    ++flow.stats.success;
    delete flow.queue[queueKey];
    flow.control.queueStart = queueKey + 1;
    // Adjust flow control
    if( flow.control.slowStartThreshold > 0 
      && flow.control.windowSize > flow.control.slowStartThreshold ) {
      console.log(date() + 'Flow control: linear increase');
      flow.control.windowSize += 1 / flow.control.windowSize;
    } else {
      console.log(date() + 'Flow control: slow start');
      ++flow.control.windowSize;
    }
    // Logging
    flowLog('success: ' + reason, flow, queueKey);
    flowLogSuccess(flow, emitter);
    // Kick
    var testQueueKey = queueKey + 1;
    if( flow.pendSuccess[testQueueKey] ) {
      // Only check the next, because we'll recurse
      var pend = flow.pendSuccess[testQueueKey];
      delete flow.pendSuccess[testQueueKey];
      flowControlSuccess('X' + pend.reason + ' HELD',
        flow, pend.emitter, pend.queueKey, pend.res);
    }
    for(var testQueueKey = queueKey + 1;
      flow.pendRetry[testQueueKey];
      ++testQueueKey) {
      var pend = flow.pendRetry[testQueueKey];
      delete flow.pendRetry[testQueueKey];
      flowControlRetryForce('X' + pend.reason + ' HELD',
        flow, pend.emitter, pend.queueKey, pend.res);
    }
    flowControlKick(flow);
  } else {
    // Success for this item is pending the queueStart item
    flowLog('X HOLD success: ' + reason, flow, queueKey);
    flow.pendSuccess[queueKey] = {
      reason: reason,
      emitter: emitter,
      queueKey: queueKey,
      res: res
    };
    // Take it out of the queue
    delete flow.queue[queueKey];
    // Check for "fast retransmit" case.
    // Note that ripple-lib handles the _actual_ retransmissions,
    // we're just trying to slow things down to prevent future 
    // problems.
    var pendSuccessCount = Object.keys(flow.pendSuccess).length;
    if(pendSuccessCount  == 3) {
      // We would do a fast retransmit here, but don't need to.
      // Start the "fast recovery" process
      flow.control.windowSize = Math.max(1, flow.control.windowSize / 2);
      if( flow.control.slowStartThreshold < 1
        || flow.control.currentItem - flow.control.queueStart < 
        flow.control.slowStartThreshold ) {
        // Only cut the slow start if we are trying to do it.
        // If the queue is bigger than the window, then we're in a
        //  recovery cycle.
        flow.control.slowStartThreshold = flow.control.windowSize;
      }
      flowLog('X fast recovery: ' + reason, flow, queueKey, res);
    }
  }
}

function flowControlFastRetransmit(reason, flow, emitter, queueKey, res) {
  /*
   * Fast retransmit - because rippled is not speaking TCP, it won't send
   * duplicate ACKs. Instead, we'll track how many successes come from later
   * requests.
     if( successIndex != min( queue.keys ) )
     {
      foreach( var key in queue.keys )
      {
        if (key < successIndex) {
          queue[key].duplicates++;
          if( queue[key].duplicates > 3 ) {
            retransmit( queue[key] ) ?
            windowSize = Math.ceil( windowSize / 2 );
          }
      }
     }
   */
  // Update the flow tracking
  //   leave the item in the queue, because ripple-lib.
  ++flow.stats.retransmits;
  emitter[flow.emitterKeyField].lastEvent = new Date();
  // Adjust flow control
  flow.control.windowSize = Math.max(1, flow.control.windowSize / 2);
  flow.control.slowStartThreshold = flow.control.windowSize;
  // Logging
  flowLog('X fast retransmit: ' + reason, flow, queueKey, res);
  // Kick
  flowControlKick(flow);
}

function flowControlTimeout(reason, flow, emitter, queueKey, res) {
  /*
   * Timeout:
     slowStartThreshhold = Math.ceil(windowSize / 2);
     windowSize = 1;
   */
  if( queueKey <= flow.control.queueStart ) {
    // Update the flow tracking
    //   leave the item in the queue, because ripple-lib.
    ++flow.stats.timeouts;
    emitter[flow.emitterKeyField].lastEvent = new Date();
    // Adjust flow control
    if( flow.control.slowStartThreshold < 1
      || flow.control.currentItem - flow.control.queueStart < 
      flow.control.slowStartThreshold ) {
      // Only cut the slow start if we are trying to do it.
      // If the queue is bigger than the window, then we're in a
      //  recovery cycle.
      flow.control.slowStartThreshold = flow.control.windowSize / 2;
    }
    flow.control.windowSize = 1;
    // Logging
    flowLog('X timeout: ' + reason, flow, queueKey, res);

    // Reset that last timeout flag so we don't incorrectly
    // fake a timeout later
    flow.control.lastTimeout = -1;
  } else {
    // Because ripple-lib timeouts are independent, and are not guaranteed
    // to occur in order, save this key and act on the timeout 
    // later when we finally succeed, unless an earlier timeout 
    // overrides it.
    // Also, note we only care about the _lowest_ timeout at any given time, 
    // because 
    flowLog('X HOLD timeout: ' + reason, flow, queueKey, res);
    if( flow.control.lastTimeout < 0
      || flow.control.lastTimeout > queueKey ) {
      flow.control.lastTimeout = queueKey;
    }
  }
}

function flowControlError(reason, flow, emitter, queueKey, res) {
  /*
   * Error - rippled can return errors, but TCP generally doesn't (no NACKs).
   * Idea: treat an error result as a fast retransmit, don't bother with the
   * overhead of tracking "duplicate ACKs".
   */
  // Update the flow tracking
  ++flow.stats.errors;
  emitter[flow.emitterKeyField].lastEvent = new Date();
  if( res
    && (
      res.engine_result == 'temREDUNDANT' 
      || res.engine_result == 'tecUNFUNDED_PAYMENT'
    )) {
    // This is a data / logical error. 
    // Treat it as if it succeeded, because we successfully
    // got an error.
    flowControlSuccess(reason, flow, emitter, queueKey, res);
  } else {
    // Adjust flow control
    // treat it like a timeout
    flowControlTimeout(reason, flow, emitter, queueKey, res);

    // And retry
    flowControlRetry(reason, flow, emitter, queueKey, res);
  }
}

function flowControlRetryForce(reason, flow, emitter, queueKey, res) {
  // Retry
  var callback = emitter[flow.emitterKeyField].callback;
  var packet = callback();
  // ignore any packet.next
  if(packet.payload) {
    flowControlSetupEmitter(flow, packet.payload, queueKey, callback);
  }
}

function flowControlRetry(reason, flow, emitter, queueKey, res) {
  if( queueKey == flow.control.queueStart ) {
    flowControlRetryForce(reason, flow, emitter, queueKey, res);
  } else {
    flowLog('X HOLD retry: ' + reason, flow, queueKey, res);
    var pend = {
      reason: reason,
      emitter: emitter,
      queueKey: queueKey,
      res: res
    };
    flow.pendRetry[queueKey] = pend;
  }
}

function flowLog(reason, flow, queueKey, detail) {
  var pendSuccessCount = Object.keys(flow.pendSuccess).length;
  var pendRetryCount = Object.keys(flow.pendRetry).length;
  var queueSize = Object.keys(flow.queue).length;
  console.log(date() + 'Flow control: ' + reason + ' #' + queueKey
    + ' (' + flow.control.currentItem
    + ', ' + flow.control.queueStart
    + ', ' + queueSize
    + ', ' + pendSuccessCount
    + ', ' + pendRetryCount
    + ', ' + Math.ceil(flow.control.windowSize)
    + ', ' + Math.ceil(flow.control.slowStartThreshold) + ')');
  console.log('Queue has ' + queueSize
    + ' outstanding items');
  console.log('Items pending completion '
    + pendSuccessCount);
  console.log('Items pending retry '
    + pendRetryCount);
  if( flow.next ) {
    console.log('Backlog has ' + flow.next.length
      + ' callbacks waiting to get kicked');
  }
  console.log(flow.control);
  console.log(flow.stats);
  if( detail ) {
    console.log(detail);
  }
}

function flowLogSuccess(flow, emitter) {
  var metaData = emitter[flow.emitterKeyField];
  metaData.now = new Date();

  var emitterDuration = (metaData.now - metaData.created) / 1000;
  var overallComplete = metaData.queueKey + 1;
  var overallDuration = (metaData.now - flow.startTime) / 1000;
  var overallRate = overallComplete / overallDuration;
  console.log(date() + 'Flow control: Payload #' + metaData.queueKey 
    + ' completed in ' + emitterDuration + ' seconds.');
  console.log(date() + 'Flow control: A total of ' + overallComplete + ' payloads have completed in '
    + overallDuration + ' seconds for an average rate of '
    + overallRate + ' payloads per second.');
}

module.exports.flowControl = flowControl;
