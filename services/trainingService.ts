import * as path from 'path';
import * as amqplib from 'amqplib'
import { MongoClient } from 'mongodb'
import {Options, PythonShell} from 'python-shell';
import fs from 'fs';

const pythonOptions: Options & {args: string[]} = {
    mode: 'text',
    pythonPath: '/home/noam/anaconda3/envs/caroline/bin/python',
    pythonOptions: ['-u'], // get print results in real-time
    scriptPath: '/home/noam/Documents/4-4 dataset/everybodydancenow',
    args: [
        "--name", "model_global",
        //--checkpoints_dir "{config['edn_structure_folder']}/{"%04d" % i}/ckpts/" \
        "--loadSize", "512", 
        "--no_instance",
        "--resize_or_crop", "none",
        "--no_flip",
        "--tf_log",
        "--label_nc", "6",
        "--niter", "5",
        "--niter_decay", "1",
        "--output_nc", "4",
    ]
  };

function pathExists(path: string): Promise<boolean> {
    return new Promise((resolve, _) => {
        fs.access(path, fs.constants.F_OK, (err) => {
            if (err) {
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

function validateFaceExists(dataset: string): Promise<void> {
    return pathExists(path.join(dataset, 'train_facetexts128')).then((exists) => {
        if (!exists) {
            
            console.log(`create face at path: ${dataset}/train_facetexts128`);
        }
    });
}


(async ()=>{

    /************ DB *************/
    const url = "mongodb://localhost:27017/DeepDance";
    const FLAT_DIRS_LOCATION = '/media/noam/second 3TD drive/DEEPDANCE_TEMP/'

    let {preparedDatasets} = await MongoClient.connect(url).then(db => {
        var dbo = db.db("mydb");
        return {
            preparedDatasets: dbo.collection("prepared-datasets")
        }
    });


    /************ get datasets to train ***********************/
    let rabbitMQChannel = await amqplib.connect('amqp://localhost').then(conn=> conn.createChannel());
    rabbitMQChannel.prefetch(1); // can train only two models at a time
    rabbitMQChannel.consume("datasets to train", async msg => {
        if(!msg) throw "empty message";
        const dir_path = msg.content.toString();
        let dataset = await preparedDatasets.findOne({dir_path});
        try  {
            if(!dataset?.checkpoints) {
                const output: string[] =  await new Promise((resolve, reject) => {
                    console.log('training global model for ', dir_path)
                    PythonShell.run('train_fullts.py', {
                        ...pythonOptions,
                        args: [
                            ...pythonOptions.args,
                            "--dataroot", dir_path,
                            "--checkpoints_dir", path.join(dir_path, "checkpoints")
                        ]
                    }, (err, out) => {
                        if(err) reject(err);
                        else resolve(out || ["no output"]);
                    })
                });
                await preparedDatasets.updateOne(
                    { dir_path },
                    { $set: { checkpoints: ['global'] } }
                )
                console.log(output.join('\n'));
            }
        } catch(e) {
            console.log(e);
            rabbitMQChannel.nack(msg);      
        }
        rabbitMQChannel.sendToQueue("datasets to local train (second phase)", Buffer.from(dir_path));
        rabbitMQChannel.ack(msg)
    }, {noAck: false})

    rabbitMQChannel.consume("datasets to local train (second phase)", async msg => {
        if(!msg) throw "empty message";
        const dir_path = msg?.content.toString();
        let dataset = await preparedDatasets.findOne({dir_path});
        if(dataset?.checkpoints?.indexOf('local') < 0 || !await pathExists(path.join(dir_path, "checkpoints", "model_local"))) {
            const output =  await new Promise((resolve, reject) => {
                console.log('training local ', dir_path)
                PythonShell.run('train_fullts.py', {
                    ...pythonOptions,
                    args: [
                        "--name", "model_local",
                        ...pythonOptions.args,
                        "--dataroot", dir_path,
                        "--checkpoints_dir", path.join(dir_path, "checkpoints"),
                        "--load_pretrain", path.join(dir_path, "checkpoints", "model_global"),
                        "--netG", "local",
                        "--ngf", "32",
                        "--num_D", "3",
                        "--ngf", "32"
                    ]
                }, (err, out) => {
                    if(err) reject(err);
                    else resolve(out);
                })
            });
            await preparedDatasets.updateOne(
                { dir_path },
                { $set: { checkpoints: ['global', 'local'] } }
            )
            console.log(output);
        } else {
            console.log('already trained local: ', dir_path, dataset?.checkpoints)
        }
        rabbitMQChannel.sendToQueue("datasets to face train (third phase)", Buffer.from(dir_path));
        rabbitMQChannel.ack(msg)
    }, {noAck: false})


    // rabbitMQChannel.consume("datasets to face train (third phase)", async msg => {
    //     if(!msg) throw "empty message";
    //     const dir_path = msg?.content.toString();
    //     let dataset = await preparedDatasets.findOne({dir_path});
    //     if(dataset?.checkpoints?.indexOf('face') < 0) {
    //         validateFaceExists(dir_path);
    //         const output =  await new Promise((resolve, reject) => {
    //             console.log('training', dir_path)
    //             PythonShell.run('train_fullts.py', {
    //                 ...pythonOptions,
    //                 args: [
    //                     "--name", "model_face",
    //                     ...pythonOptions.args,
    //                     "--dataroot", dir_path,
    //                     "--checkpoints_dir", path.join(dir_path, "checkpoints"),
    //                     "--load_pretrain", path.join(dir_path, "checkpoints", "model_local"),
    //                     "--netG", "local",
    //                     "--ngf", "32",
    //                     "--num_D", "3",
    //                     "--ngf", "32",
    //                     "--face_discrim",
    //                     "--face_generator",
    //                     "--faceGtype", "global",
    //                     "--niter_fix_main", "10",
    //                 ]
    //             }, (err, out) => {
    //                 if(err) reject(err);
    //                 else resolve(out);
    //             })
    //         });
    //         await preparedDatasets.updateOne(
    //             { dir_path },
    //             { $set: { checkpoints: ['global', 'local'] } }
    //         )
    //         console.log(output);
    //     } else {
    //         console.log('already trained local: ', dir_path, dataset?.checkpoints)
    //     }
    //     rabbitMQChannel.ack(msg)
    // }, {noAck: false})


})()