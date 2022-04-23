import * as fs from 'fs';;
import * as express from "express";
import * as amqp from 'amqplib';

(async ()=>{
	/********* file system utilities *********/
	function getDirContent(dirpath: string) {
		console.log(fs.readdirSync(dirpath, {withFileTypes: true}).map(item => item.name))
		return fs.readdirSync(dirpath, {withFileTypes: true})
		.map(item => item.name)
	}

	function getFirstFile(path: string) {
		if(fs.statSync(path).isDirectory())
			return getFirstFile(path + "/" + fs.readdirSync(path)[0])
		else return path;
	}

	/********** web server ************/
	const app = express.default();
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


	const channel = await amqp.connect('amqp://localhost').then(connection => connection.createChannel());

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

	app.listen(PORT, () => console.log(`Server listening on port: ${PORT}`));
})()