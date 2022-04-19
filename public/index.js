let path;

function checkURL() {
    path = document.getElementById('path').value

    fetch('checkDB', {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({path})
    }).then(res => res.json())
      .then(res => document.querySelector('#show-sub-folders').innerHTML = res
        .map(res =>`<li>${res}</li>`)
        .join('')
      );
}

function submitURL() {
    console.log(1);
}

checkURL();
