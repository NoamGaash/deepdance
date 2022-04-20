let path;

async function postJSON(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }).then(res => res.json())
}

async function listDirectory(path) {
    return postJSON('checkDB', {path});
}

async function getFirstFile(path) {
    return postJSON('getFirstFile', {path});
}


function createPathListingItem(path, file) {
    const elem = document.createElement("li");
    elem.innerHTML = `<pre>${file}</pre>`;
    const innerUL = document.createElement('ul');
    elem.appendChild(innerUL);
    elem.querySelector('pre').addEventListener('click', () => {
        elem.classList.toggle("open")
        if(elem.classList.contains("open"))
            createDirectoryContentList(`${path}/${file}`, innerUL);
        else
            innerUL.innerHTML='';
    });
    return elem;
}

async function createDirectoryContentList(path, UlElement) {
    UlElement.innerHTML='';
    files = await listDirectory(path);
    files.map(file => {
        if(file.indexOf('.png') >= 0) {
            const img = document.createElement('img')
            img.src = `${path}/${file}`;
            return img;
        }else {
            return createPathListingItem(path, file);
        }
    }).forEach(element => {
        UlElement.appendChild(element)
    });

}

function submitURL() {
    console.log(1);
}

async function onPathUpdate () {
    const path = this.value;
    const ul = this.parentElement.querySelector('.show-sub-folders');
    createDirectoryContentList(path, ul);
    this.parentElement.querySelector(".first-image").innerHTML = `<img src="${(await getFirstFile(path)).file}">`;
};


$('.path').keyup(onPathUpdate)
$('.path').keyup()