let path;

async function listDirectory(path) {
    return fetch('checkDB', {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({path})
    }).then(res => res.json())
    //   .then(res => document.querySelector('#show-sub-folders').innerHTML = res
    //     .map(res =>`<li>${res}</li>`)
    //   );
}

async function createDirectoryContentList(path, UlElement) {
    UlElement.innerHTML='';
    files = await listDirectory(path);
    files.map(file => {
        const elem = document.createElement("li");
        elem.innerHTML = `<pre>${file}</pre>`;
        const innerUL = document.createElement('ul');
        elem.appendChild(innerUL);
        let open = false;
        elem.querySelector('pre').addEventListener('click', () => {
            open = !open;
            if(open)
                createDirectoryContentList(`${path}/${file}`, innerUL);
            else
                innerUL.innerHTML='';
        });
        return elem;
    }).forEach(element => {
        UlElement.appendChild(element)
    });

}

function submitURL() {
    console.log(1);
}



document.querySelector("#path").addEventListener("keyup", e => {
    const path = e.target.value;
    const ul = document.querySelector('#show-sub-folders');
    createDirectoryContentList(path, ul);
})

createDirectoryContentList(document.querySelector("#path").value, document.querySelector('#show-sub-folders'))