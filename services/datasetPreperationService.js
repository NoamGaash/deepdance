const amqp = require('amqplib/callback_api');
const walkSync = require('walk-sync');
const { copyFileSync, mkdirSync, cpSync } = require('fs')
const { v4: uuidv4 } = require('uuid');
var path = require('path');

/************ DB *************/
var MongoClient = require('mongodb').MongoClient;
var url = "mongodb://localhost:27017/DeepDance";
const FLAT_DIRS_LOCATION = '/media/noam/second 3TD drive/DEEPDANCE_TEMP/'

var flattenDatasets, preparedDatasets;
var rammitMQChannel;

MongoClient.connect(url, function(err, db) {
  if (err) throw err;
  var dbo = db.db("mydb");
  flattenDatasets = dbo.collection("flatten-datasets");
  preparedDatasets = dbo.collection("prepared-datasets");
});



/************ UTILS  ****************/
Number.prototype.pad = String.prototype.pad = function(size) {
    // source: https://stackoverflow.com/questions/2998784/how-to-output-numbers-with-leading-zeros-in-javascript
    var s = String(this);
    while (s.length < (size || 2)) {s = "0" + s;}
    return s;
}







function flat_dir(dir_url){
    const target_dir = `${FLAT_DIRS_LOCATION}/flatten_directories/${uuidv4()}`;
    const paths = walkSync(dir_url, { directories: false, includeBasePath: true });
    mkdirSync(target_dir, {recursive:true})

    for(let i in paths) {
        const file = paths[i];
        const extention = file.split('.').pop();
        copyFileSync(
            file,
            path.join(target_dir, i.pad(6) + '.' + extention)
        );
    }
    return [target_dir, paths.length];
}


amqp.connect('amqp://localhost', function(error, connection) {
  if (error) throw error;
  connection.createChannel(function(error, channel) {
    if (error) throw error;
    rammitMQChannel = channel;

    var queue = 'userCreatedTasks';
    channel.assertQueue(queue, {durable: false});
    channel.consume(queue,  function(msg) {
        const task = JSON.parse(msg.content.toString());
        handleUserTask(task);
        channel.ack(msg)
      }, {});
  });
});

async function verifyFlattenDirectory(dir_to_flat) {
    let flatted_dir = (await flattenDatasets.findOne({original: dir_to_flat}));
    if(!flatted_dir?.flatten) {
        [flatted_dir, files] = flat_dir(dir_to_flat);
        flatted_dir = {original: dir_to_flat, flatten: flatted_dir, files};
        console.log('flated directory', flatted_dir);
        await flattenDatasets.insertOne(flatted_dir);
    }
    return flatted_dir;
}

async function handleUserTask(task) {
    if(task.dimentions == 0) {
        const flat_iuv = verifyFlattenDirectory(task.iuv);
        const flat_rgb = verifyFlattenDirectory(task.rgb);
        console.log('finished', {flat_iuv, flat_rgb, task})
        make_db(flat_iuv, flat_rgb);
    }else if (task.dimentions == 2) {
        const iuvPaths = walkSync(task.iuv, { globs: ['*/*/'], includeBasePath: true });
        const flat_iuvs = await Promise.all(iuvPaths.map(verifyFlattenDirectory));
        const rgbPaths = walkSync(task.rgb, { globs: ['*/'], includeBasePath: true });
        const flat_rgbs = await Promise.all(rgbPaths.map(verifyFlattenDirectory));
        flat_iuvs.forEach((iuv, ind) => make_db(iuv, flat_rgbs[ind % flat_rgbs.length]));
        console.log('finished', {rgbPaths, iuvPaths, task});
    }
}

async function make_db(driving_frames_dir, real_frames_dir){
    let target_dir = (await preparedDatasets.findOne({
        driving_frames_dir,
        real_frames_dir
    }))?.dir_path;

    if(!target_dir) {
        target_dir = `${FLAT_DIRS_LOCATION}/datasets/${uuidv4()}/`;
        mkdirSync(target_dir, {recursive:true});
        cpSync(driving_frames_dir.flatten, `${target_dir}/train_label`, {recursive:true});
        cpSync(real_frames_dir.flatten, `${target_dir}/train_img`, {recursive:true});
        cpSync(real_frames_dir.flatten, `${target_dir}/test_img`, {recursive:true});
        
        // TODO: add faces

        preparedDatasets.insertOne({
            driving_frames_dir,
            real_frames_dir,
            dir_path: target_dir
        });
    }

    return [target_dir];
}


