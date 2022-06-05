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
    postJSON('/submit', {
        dimentions: document.querySelector(".dimentions").value,
        iuv: document.querySelector("#iuv .path").value,
        rgb: document.querySelector("#rgb .path").value
    })
}

async function onPathUpdate () {
    const path = this.value;
    const ul = this.parentElement.querySelector('.show-sub-folders');
    createDirectoryContentList(path, ul);
    this.parentElement.querySelector(".first-image").innerHTML = `<img src="${(await getFirstFile(path)).file}">`;
};


$('.path').keyup(onPathUpdate)
$('.path').keyup()

// get list of datasets and UL element and generate list items
function createDatasetList(datasets, ul) {
    datasets.map(dataset => {
        const li = document.createElement("li");
        li.innerHTML = `
        <ul>
            ${dataset._id}
            <li>files: ${dataset.dir_path}</li>
            <li>trained: ${dataset.checkpoints}</li>
        `;
        if(dataset.checkpoints?.length > 0) { // dataset was globally trained
            li.innerHTML += `
            <li>
                global:
                <img src="${dataset.dir_path}/checkpoints/model_global/web/images/epoch006_synthesized_image.png"/>
            </li>`;
        }
        if(dataset.checkpoints?.length > 1) { // dataset was locally trained
            li.innerHTML += `
            <li>
                local:
                <img src="${dataset.dir_path}/checkpoints/model_local/web/images/epoch006_synthesized_image.png"/>
            </li>`;
        }
        li.innerHTML += `</ul>`;
        return li;
    }).forEach(element => {
        ul.appendChild(element)
    });
}


/********* list directories and DBs *********/
const uppdateDirsAndDbs = ()=>{
    fetch('tasksStatus').then(res => res.json()).then((res) => { // res: {preparedDatasets: any, flattenDatasets: any}

        // update flatten directories

        const flattenDatasetsUL = document.querySelector('#flatten-directories ul');
        flattenDatasetsUL.innerHTML = ""; // clear the list of flatten datasets
        69+res.flattenDatasets.forEach(directory => {
            const li = document.createElement('li');
            li.innerHTML = `
            ${directory.original.substring(directory.original.indexOf('/T'))}
            <ul>
                <li>files: ${directory.files}</li>
                <li>original: ${directory.original}</li>
                <li>flatten: ${directory.flatten}</li>
            </ul>`;
            flattenDatasetsUL.appendChild(li);
        });
        
        document.querySelector("#flatten-directories h2").innerHTML = `flatten directories (${res.flattenDatasets.length})`;

        // update untrained datasets

        const preparedDatasetsUL = document.querySelector('#prepared-datasets-initial ul');
        preparedDatasetsUL.innerHTML = ""; // clear the list of prepared datasets

        const pretrainedDatasets = res.preparedDatasets.filter(directory => directory.checkpoints?.length === 0);

        pretrainedDatasets.forEach(directory => {
            const li = document.createElement('li');
            li.innerHTML = `
            <ul>
                ${directory._id}
                <li>files: ${directory.dir_path}</li>
                <li>trained: ${directory.checkpoints}</li>
            </ul>`;
            preparedDatasetsUL.appendChild(li);
        });

        document.querySelector("#prepared-datasets-initial h2").innerHTML = `prepared datasets (${pretrainedDatasets.length})`;

        // update globally trained datasets
        const preparedDatasetsGloballyTrainedUL = document.querySelector('#prepared-datasets-globally-trained ul');
        preparedDatasetsGloballyTrainedUL.innerHTML = ""; // clear the list of prepared datasets

        const pretrainedDatasetsGloballyTrained = res.preparedDatasets.filter(directory => directory.checkpoints?.length === 1);

        createDatasetList(pretrainedDatasetsGloballyTrained, preparedDatasetsGloballyTrainedUL)

        document.querySelector("#prepared-datasets-globally-trained h2").innerHTML = `prepared datasets (globally trained) (${pretrainedDatasetsGloballyTrained.length})`;

        // update locally trained datasets
        const preparedDatasetsLocallyTrainedUL = document.querySelector('#prepared-datasets-locally-trained ul');
        preparedDatasetsLocallyTrainedUL.innerHTML = ""; // clear the list of prepared datasets
        
        const locallyTrainedDatasets = res.preparedDatasets.filter(directory => directory.checkpoints?.length === 2);

        locallyTrainedDatasets.forEach(directory => {
            const li = document.createElement('li');
            li.innerHTML = `
            <ul>
                ${directory._id}
                <li>files: ${directory.dir_path}</li>
                <li>trained: ${directory.checkpoints}</li>
                <li>
                    global:
                    <img src="${directory.dir_path}/checkpoints/model_global/web/images/epoch006_synthesized_image.png"/>
                </li>
                <li>
                    local:
                    <img src="${directory.dir_path}/checkpoints/model_local/web/images/epoch006_synthesized_image.png"/>
                </li>
            </ul>`;
            preparedDatasetsLocallyTrainedUL.appendChild(li);
        });

        document.querySelector("#prepared-datasets-locally-trained h2").innerHTML = `prepared datasets (locally trained) (${locallyTrainedDatasets.length})`;

    });
}

uppdateDirsAndDbs()
setInterval(uppdateDirsAndDbs, 5000)
