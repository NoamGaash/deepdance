const { promisify } = require('util');
const { resolve } = require('path');

const fs = require('fs')

function getDirContent(dirpath) {
	console.log(fs.readdirSync(dirpath, {withFileTypes: true}).map(item => item.name))
	return fs.readdirSync(dirpath, {withFileTypes: true})
	//.filter(item => !item.isDirectory())
	.map(item => item.name)
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
	console.log(req.body)
	res.send(getDirContent(req.body.path));
})

app.listen(PORT, () => console.log(`Server listening on port: ${PORT}`));
