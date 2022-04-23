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



var amqp = require('amqplib/callback_api');

amqp.connect('amqp://localhost', function(error0, connection) {
  if (error0) {
    throw error0;
  }
  connection.createChannel(function(error1, channel) {
    if (error1) {
      throw error1;
    }
    var queue = 'userCreatedTasks';

    channel.assertQueue(queue, {
      durable: false
    });


	app.post('/submit', (req, res) => {
		const msg = JSON.stringify(req.body);
		channel.sendToQueue(queue, Buffer.from(msg));
    	console.log(" [x] Sent %s", msg);
		res.send('ok');
	})
    
  });
});




app.listen(PORT, () => console.log(`Server listening on port: ${PORT}`));
