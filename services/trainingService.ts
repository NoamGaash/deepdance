import * as path from 'path';
import * as amqplib from 'amqplib'
import { Document, MongoClient, WithId } from 'mongodb'
import {Options, PythonShell} from 'python-shell';
import fs from 'fs';

const pythonOptions: Options & {args: string[]} = {
    mode: 'text',
    pythonPath: '/home/noam/anaconda3/envs/caroline/bin/python',
    pythonOptions: ['-u'], // get print results in real-time
    scriptPath: '/home/noam/Documents/4-4 dataset/everybodydancenow',
    args: [
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


function getPythonOptions(dataset: string, phase: 'global' | 'local' | 'face'): Options & {args: string[]} {
    switch(phase){
        case 'global':
            return {
                ...pythonOptions,
                args: [
                    ...pythonOptions.args,
                    "--name", "model_global",
                    "--dataroot", dataset,
                    "--checkpoints_dir", path.join(dataset, "checkpoints"),
                    "--netG", phase == 'global' ? 'global' : 'local',
                ]
            }
        case 'local':
            return {
                ...pythonOptions,
                args: [
                    ...pythonOptions.args,
                    "--name", "model_local",
                    "--netG", "local",
                    "--ngf", "32",
                    "--num_D", "3",
                    "--ngf", "32",
                    "--dataroot", dataset,
                    "--checkpoints_dir", path.join(dataset, "checkpoints"),
                    "--load_pretrain", path.join(dataset, "checkpoints", `model_global`)
                ]
            }
        case 'face':
            return {
                ...pythonOptions,
                args: [
                    ...pythonOptions.args,
                    "--name", "model_face",
                    "--dataroot", dataset,
                    "--checkpoints_dir", path.join(dataset, "checkpoints"),
                    "--load_pretrain", path.join(dataset, "checkpoints", `model_local`),
                    "--face_discrim",
                    "--face_generator",
                    "--faceGtype global",
                    "--niter_fix_main", "10",
                    "--netG", "local",
                    "--ngf", "32",
                    "--num_D", "3",
                    "--label_nc", "6",
                ]
            }
    }
}

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
    const gpus = [0,1];
    rabbitMQChannel.prefetch(2); // can train only two models at a time
    rabbitMQChannel.consume("datasets to train", async msg => await training_phase(msg, 'global'), {noAck: false})
    rabbitMQChannel.consume("datasets to local train (second phase)", async msg => await training_phase(msg, 'local'), {noAck: false})
    //rabbitMQChannel.consume("datasets to face train (third phase)", async msg => await training_phase(msg, 'face'), {noAck: false})

    const currentlyTraining = new Set<string>();

    /**
     * accuire a lock on the dataset, to prevent multiple training processes from running on the same dataset.
     * ack the message if the lock is previously acquired.
     * 
     * @param msg a message with the dir_path of the dataset, describing witch dataset to train
     * @returns true if training is acquired, false if it's already being trained
     * @see releaseDatasetLock
     */
    function accuireDatasetLock(msg: amqplib.Message | null): boolean {
        if (!msg) return false;
        if(currentlyTraining.has(msg?.content.toString())) {
            return false;
        }
        currentlyTraining.add(msg?.content.toString());
        return true;
    }

    /**
     * release a lock from the dataset, should be called after training is done.
     * side affect - ack the message, since it can be removed from the queue
     * 
     * @see accuireTraining
     * @param msg a message with the dir_path of the dataset, describing witch dataset to train
     * @returns true if training is acquired, false if it's already being trained
     */
    function releaseDatasetLock(msg: amqplib.Message | null): boolean {
        if (!msg || !currentlyTraining.has(msg?.content?.toString())) {
            return false;
        }
        currentlyTraining.delete(msg?.content.toString());
        msg && rabbitMQChannel.ack(msg);
        return true;
    }

    /**
     * accuire a gpus lock, to prevent multiple training processes from running on the same gpus.
     * @returns number of the newly acquired gpu
     */
    function accuireGPU(): number {
        const gpu = gpus.shift() ?? 1;
        return gpu;
    }

    /**
     * release a gpus lock, should be called after training is done.
     * @param gpu number of the gpu to release
     */
    function releaseGPU(gpu: number): void {
        gpus.push(gpu);
    }

    /**
     * prepare to train a dataset, by accuiring a lock on the dataset, and accuiring a gpu.
     * @returns the gpu and the dataset
     * @throws if there is no message, or no GPU available, or
     * if the dataset is already being trained.
     */
    async function beforeTraining(msg: amqplib.Message | null) : Promise<{gpu: number, dataset: any}> {
        if(!msg) throw "empty message";
        if(!accuireDatasetLock(msg)) throw "dataset is already being trained";
        const gpu = accuireGPU();
        const dir_path = msg.content.toString();
        let dataset = await preparedDatasets.findOne({dir_path});
        return {gpu, dataset};
    }

    async function afterTraining(phase: "global" | "local" | "face", gpu: number, dataset: WithId<Document>) {
        const checkpoints = {
            'global': ['global'],
            'local': ['global', 'local'],
            'face': ['global', 'local', 'face']
        }[phase];

        await preparedDatasets.updateOne(
            { dir_path: dataset.dir_path },
            { $set: { checkpoints: checkpoints } }
        )
        if(phase === "global") {
            rabbitMQChannel.sendToQueue("datasets to local train (second phase)", Buffer.from(dataset.dir_path));
        } else if (phase === "local") {
            rabbitMQChannel.sendToQueue("datasets to face train (third phase)", Buffer.from(dataset.dir_path));
        } else {
            rabbitMQChannel.sendToQueue("datasets to infer", Buffer.from(dataset.dir_path));
        }
    }

    async function training_phase(msg: amqplib.Message | null, phase: "global" | "local" | "face") {
        let _gpu: number = 0;
        try  {
            const {gpu, dataset} = await beforeTraining(msg);
            _gpu = gpu;
            if(!dataset.checkpoints || dataset.checkpoints.indexOf(phase) === -1) {
                const output: any[] =  await run_training(gpu, dataset.dir_path, phase);
                console.log(output.join('\n'));
            } else {
                // uncomment to debug specific dataset
                /* if(dataset.dir_path.indexOf('0d8a') >= 0) {
                     console.log(`${dataset.dir_path} is already trained on ${phase}`, dataset.checkpoints);
                 }*/
            }
            await afterTraining(phase, gpu, dataset);
        } catch(e) {
            console.log(e);
        } finally {
            releaseDatasetLock(msg);
            releaseGPU(_gpu);
        }
    }

    function run_training(gpu: number, dataset_path: string, phase: 'global' | 'local' | 'face'): Promise<string[]>{
        return new Promise((resolve, reject) => {
            console.log(`training ${phase} model on gpu #${gpu} for ${dataset_path}`)
            // python "/home/noam/Documents/4-4 dataset/everybodydancenow/train_fullts.py" --loadSize 512 --no_instance --resize_or_crop none --no_flip --tf_log --label_nc 6 --niter 5 --niter_decay 1 --output_nc 4 --name model_local --dataroot "/media/noam/second 3TD drive/DEEPDANCE_TEMP//datasets/67a2d49f-b53a-49b3-9982-51261ddf8560/" --checkpoints_dir "/media/noam/second 3TD drive/DEEPDANCE_TEMP/datasets/67a2d49f-b53a-49b3-9982-51261ddf8560/checkpoints" --load_pretrain "/media/noam/second 3TD drive/DEEPDANCE_TEMP/datasets/67a2d49f-b53a-49b3-9982-51261ddf8560/checkpoints/model"_global --netG local --ngf 32 --num_D 3 --ngf 32
            PythonShell.run(
                'train_fullts.py',
                getPythonOptions(dataset_path, phase),
                (err, out) => {
                    if(err) reject(err);
                    else if(out) resolve(out);
                }
            )
        });
    }
})()