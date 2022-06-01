import * as fs from 'fs';;
import * as express from "express";
import * as amqp from 'amqplib';
import { MongoClient } from 'mongodb'

(async ()=>{
	/********* file system utilities *********/
	function getDirContent(dirpath: string) {
		console.log(fs.readdirSync(dirpath, {withFileTypes: true}).map(item => item.name))
		return fs.readdirSync(dirpath, {withFileTypes: true})
		.map(item => item.name)
	}

	function getFirstFile(path: string) : string{
		if(fs.statSync(path).isDirectory())
			return getFirstFile(path + "/" + fs.readdirSync(path)[0])
		else return path;
	}

	const url = "mongodb://localhost:27017/DeepDance";
    
    let {preparedDatasets, flattenDatasets} = await MongoClient.connect(url).then(db => {
        var dbo = db.db("mydb");
        return {
            preparedDatasets: dbo.collection("prepared-datasets"),
            flattenDatasets: dbo.collection("flatten-datasets")
        }
    });


	/********* validate DB ***********************/
	setInterval(()=>{	
		preparedDatasets.find({}).toArray((err, res)=>{
			if(err) throw err;
			res?.forEach(item => {
				const hasGlobal = fs.existsSync(item.dir_path + "/checkpoints/model_global/web/images/epoch006_synthesized_image.png");
				const hasLocal = fs.existsSync(item.dir_path + "/checkpoints/model_local/web/images/epoch006_synthesized_image.png");
				const checkpoints = [];
				if(hasGlobal) checkpoints.push('global');
				if(hasLocal) checkpoints.push('local');
				preparedDatasets.updateOne({dir_path: item.dir_path}, {$set: {checkpoints: checkpoints}});
			});
		});
	}, 10000);

	/********** web server ************/
	const app = express.default();
	const PORT = 3000;

	app.use(express.static('public'));
	app.use(express.json());

	app.get('/', (req, res) => {
		res.send('Hello Noam!');
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

	app.get('/tasksStatus', async (req, res) => {
		res.send({
			preparedDatasets: await preparedDatasets.find().toArray(),
			flattenDatasets: await flattenDatasets.find().toArray()
		})
	});

	app.listen(PORT, () => console.log(`Server listening on port: ${PORT}`));
})()