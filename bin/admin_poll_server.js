#!/usr/bin/env node
require('../lib/bootstrap');

var
  config = require('config/default'),

  // node core
  http = require('http'),
  // lib to ease request handling for this project
  Request = require('lib/request').Request,

  messages = [],
  messageListeners = [],

  db = require('dep/node-couch/module/node-couch')
    .CouchDB.db(
      config.couchDb.db,
      config.couchDb.port,
      config.couchDb.host
    ),

  changeClient = http.createClient(config.couchDb.port, config.couchDb.host),
  changeRequest = changeClient.request(
    'GET',
    // Couch 0.11.x (trunk) supports ?include_docs=true, but we'll do it without
    '/'+config.couchDb.db+'/_changes?feed=continuous&heartbeat=30000'
  );

  // Avoid the http client closing the connection after 60sec
  changeClient.setTimeout(0);

  http
    .createServer(function(req, res) {
      var request = new Request(req, res);

      if (request.url.pathname !== '/messages') {
        return request.respond(404, {error: 404});
      }

      if (!('since' in request.url.query)) {
        return request.respond(400, {error: 'bad request, no ?since parameter'});
      }

      var since = parseInt(request.url.query.since, 10);
      // Negative since is used by new clients to get the last abs(since) messages
      if (since < 0) {
        var
          r = [],
          i = messages.length;

        while (i > 0) {
          i--;
          r.push(messages[i]);
          if (r.length == -since) {
            break;
          }
        }

        return request.respond(200, {
          ok: true,
          seq: (messages[messages.length-1] || {seq: 0}).seq,
          messages: r
        });
      }

      var
        r = [],
        i = messages.length;

      while (i > 0) {
        i--;
        if (messages[i].seq <= since) {
          break;
        }

        r.push(messages[i]);
      }

      if (!r.length) {
        return messageListeners
          .push(function(message) {
            request.respond(200, {
              ok: true,
              seq: message.seq,
              messages: [message]
            });
          });
      }

      return request.respond(200, {
        ok: true,
        seq: messages[messages.length-1].seq,
        messages: r
      });
  })
  .listen(config.admin_poll.port);

// Watch CouchDB for changes
changeRequest.finish(function(res) {
  var buffer = '';
  res.addListener('body', function(chunk) {
    buffer += (chunk || '');

    var offset, change;
    while ((offset = buffer.indexOf("\n")) >= 0) {
      change = buffer.substr(0, offset);
      buffer = buffer.substr(offset +1);

      // Couch sends an empty line as the "heartbeat"
      if (change == '') {
        return puts('couch heartbeat');
      }

      puts('couch change: '+change);

      try {
        if( change != "" ){
          change = JSON.parse(change);
        }
      } catch (e) {
        throw new Error('Could not parse change line: "'+change+'"');
      }

      if (!change.id) {
        return puts('weird couch change: '+JSON.stringify(change));
      }

      // Fetch the document for this change
      db.openDoc(change.id, {
        success: function(doc) {
          // Filter out the docs we care about
          // we could also use couch's filter docs this, but this is nice & simple
          if (doc.type != 'message') {
            // TODO remove doc.show boolean...
            return;
          }
          
          if (doc.status != 'approved' && doc.status != 'awaiting_response') {
            // TODO remove doc.show boolean...
            return;
          }

          var doc_ids = messages.map(function(message, i){
            return message._id;
          });

          // Set the change seq for this message
          doc.seq = change.seq;
          
          var found = null;
          doc_ids.map(function(elem,i){
            if(doc._id == elem){
              found = true;
            }
          });
          
          // Find the Element
          if(found){
            
            // ELEMENT EXISTS ALREADY
            var pos = null;
            messages.map(function(elem, i){
              if( elem._id == doc._id ){
                pos = i;
                return elem;
              }
            })
            
            if(doc.status == "approved"){
                puts("SPLICED")
                // TODO this should remove approved comments from the messages array so they are not
                // returned to the admin again.
                messages.splice(pos,1);
              //delete messages[pos];
            }else{
              messages[pos] = doc;
            }
            
          } else {
            if(doc.status == "approved"){
              // do nothing
            } else {
                // Add it to the list of messages
              messages.push(doc); 
            }
          }

          // TODO does this message exist in messages[]
          // no? 
          //  add it to array
          // yes?
          //  replace message with new data

          // Get rid of an old message if the backlog is full
          if (messages.length > config.admin_poll.backlog) {
            messages.shift();
          }

          messageListeners = messageListeners
            .filter(function(callback) {
              var r = callback(doc);
              // Remove listeners with no / false return values
              return (r === undefined)
                ? false
                : r;
            });
        },
        error: function(e) {
          throw e;
        }
      });
    }

  });

  res.addListener('complete', function() {
    throw new Error('CouchDB closed /_changes stream on us!');
  });
});

