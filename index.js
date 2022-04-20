const { promisify } = require('util');
const { resolve } = require('path');

const fs = require('fs')

function getDirContent(dirpath) {
	console.log(fs.readdirSync(dirpath, {withFileTypes: true}).map(item => item.name))
	return fs.readdirSync(dirpath, {withFileTypes: true})
	.map(item => item.name)
}

function getFirstFile(path) {
	if(fs.statSync(path).isDirectory())
		return getFirstFile(path + "/" + fs.readdirSync(path)[0])
	else return path;
}



const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.post('/checkDB', (req, res) => {
	res.send(getDirContent(req.body.path));
})
app.post('/getFirstFile', (req, res) => {
	const result = {file: getFirstFile(req.body.path)}
	console.log(result)
	res.send(result);
})



app.use((req, res, next) => {
	if(req.path.endsWith('.png'))
		res.sendFile(decodeURI(req.path))
	else next();
})

app.listen(PORT, () => console.log(`Server listening on port: ${PORT}`));
