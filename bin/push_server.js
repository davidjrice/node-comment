#!/usr/bin/env node
require('../lib/bootstrap');
var posix = require('posix');

var swears = [];
posix.cat("config/swears.txt").addCallback(function (content) {
  swears = content.split('\n')
});

var
  config = require('config/default'),

  // node core
  http = require('http'),
  // my lib to serve static files
  paperboy = require('dep/node-paperboy/lib/paperboy'),

  // lib to ease request handling for this project
  Request = require('lib/request').Request,

  // A quick little module to generate uuids
  uuid = require('lib/uuid'),

  db = require('dep/node-couch/module/node-couch').CouchDB.db(
    config.couchDb.db,
    config.couchDb.port,
    config.couchDb.host
  );

http
  .createServer(function(req, res) {
    paperboy
      .deliver('public', req, res)
      .otherwise(function() {
        var
          request = new Request(req, res);

        if (request.url.pathname != '/message') {
          return request.respond(404, {error: 404});
        }

        if (!request.url.query['message']) {
          return request.respond(400, {error: 'bad request, no ?message parameter'});
        }
        
        var ip = request['req']['connection']['remoteAddress'];
        
        // Swear whitelist
        var message = request.url.query['message'];
        var essence = message.toLowerCase().replace(/[^\.\'a-zA-Z]/, '')
        var dirty = false;
        essence.split(' ').forEach(function(word){
          swears.forEach(function(swear){
            if(word == swear){
              dirty = true;
              return request.respond(400, {error: 'wash that dirty mouth'});
            }
          })
        });
        
        if( !dirty ){
          db.saveDoc({
            _id: uuid.generate(),
            // would probably be better as an ISO string for sorting
            time: +new Date,
            type: 'message',
            message: request.url.query['message'],
      		  relaxdb_class: "Comment",
      		  status: 'awaiting_response', //awaiting_response || spam || inappropriate || destroyed states
            show: true,
            ip: ip
          }, {
            success: function() {
              request.respond(200, {ok: 'message stored'});
            },
            error: function(e) {
              throw e;
            },
          }); 
        } else {
          puts("DIRTY message: '"+message+"'")
        }
      });
  })
  .listen(config.push.port);