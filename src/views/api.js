function getServiceURI(endpoint) {
  return location.href + endpoint;
}

function sendXhr(imageData, endpoint, onResult) {
  var xhr = new XMLHttpRequest();

  xhr.onreadystatechange = function(err) {
    if (xhr.readyState == 4)  {
      if (xhr.status == 202) {
        const response = JSON.parse(xhr.responseText);
        onResult(null, response);
      } else {
        onResult(xhr.status + ': ' + xhr.responseText, null);
      }
    }
  };

  xhr.open('POST', getServiceURI(endpoint), true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(JSON.stringify({ imgBase64 : imageData }));
}
