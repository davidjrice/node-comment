process.mixin(require("./common"));
var Mustache = require('../dep/node-mustache')

var got_error = false;
var filename = path.join(fixturesDir, "test_mustache_with_no_template_tags.html");
var promise = posix.cat(filename, "raw");
var html_fixture = "<html><head></head><body><h1>Test</h1></body></html>"

promise.addCallback(function (template) {
  var html = Mustache.to_html(template, {});
  assert.equal(html_fixture, html);
});
