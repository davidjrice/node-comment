$(function() {
  var
    $status = $('#pushstatus'),
    $comment = $('#comment'),
    $name = $('#name')
    pushUrl = [
      'http://',
      window.location.hostname,
      ':',
      window.location.port, // @todo, read from config/default.js
      '/comments/add'
    ].join('');

  $('form').submit(function() {
    var val = $comment.val();
    var name = $name.val();
    
    $status.text('Sending comment ...');
    $comment.val('');
    
    var start = +new Date;
    $.ajax({
      url: pushUrl,
      data: {text: val, name: name},
      dataType: 'jsonp',
      success: function() {
        var duration = (+new Date - start);
        $status.text('Comment pushed to couch in '+duration+'ms');
      },
      error: function(XMLHttpRequest, textStatus, errorThrown) {
        var response = XMLHttpRequest.responseText;
        var start = response.indexOf('(');
        var finish = response.indexOf(')');
        var json = JSON.parse( response.substring(start+1,finish) );
        $status.text(json['error']);
      }
    })

    return false;
  });
});