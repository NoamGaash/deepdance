const walkSync = require('walk-sync');
const { copyFileSync, mkdirSync, cpSync } = require('fs')
const { v4: uuidv4 } = require('uuid');
var path = require('path');
import { MongoClient } from "mongodb"
import * as amqplib from 'amqplib'



/************ UTILS  ****************/
declare global {
    interface Number{pad: (size :number)=>string}
    interface String{pad: (size :number)=>string}
};


Number.prototype.pad = String.prototype.pad =  function(size: number) {
    // source: https://stackoverflow.com/questions/2998784/how-to-output-numbers-with-leading-zeros-in-javascript
    var s = String(this);
    while (s.length < (size || 2)) {s = "0" + s;}
    return s;
};


(async () => {

    /************ types ************/
    type task = {
        iuv: string
        rgb: string
        dimentions: number
    }

    type flatten_directory = {
        original: string
        flatten: string
        size: number
    }

    type dataset = {
        driving_frames_dir: flatten_directory
        real_frames_dir: flatten_directory
        dir_path: string
    }


    /************ DB *************/
    const url = "mongodb://localhost:27017/DeepDance";
    const FLAT_DIRS_LOCATION = '/media/noam/second 3TD drive/DEEPDANCE_TEMP/'

    let {flattenDatasets, preparedDatasets} = await MongoClient.connect(url).then(db => {
    var dbo = db.db("mydb");
    return {
        flattenDatasets: dbo.collection<flatten_directory>("flatten-datasets"),
        preparedDatasets: dbo.collection<dataset>("prepared-datasets")
    }
    });

    /*********** MQ **************/
    let rammitMQChannel = await amqplib.connect('amqp://localhost').then(conn=> conn.createChannel());

    /*********** directory flattening *****************/

    function flat_dir(dir_url: string) : flatten_directory {
        const target_dir = `${FLAT_DIRS_LOCATION}/flatten_directories/${uuidv4()}`;
        const paths: String[] = walkSync(dir_url, { directories: false, includeBasePath: true });
        mkdirSync(target_dir, {recursive:true})

        for(let i in paths) {
            const file = paths[i];
            const extention = file.split('.').pop();
            copyFileSync(
                file,
                path.join(target_dir, i.pad(6) + '.' + extention)
            );
        }
        return {
            original: dir_url,
            flatten: target_dir,
            size: paths.length
        };
    }
    async function verifyFlattenDirectory(dir_to_flat: string): Promise<flatten_directory> {
        let flatted_dir: flatten_directory | null = (await flattenDatasets.findOne({original: dir_to_flat}));
        if(!flatted_dir?.flatten) {
            flatted_dir = flat_dir(dir_to_flat);
            console.log('flated directory', flatted_dir);
            await flattenDatasets.insertOne(flatted_dir);
        }
        return flatted_dir;
    }

    /************ user tasks handling *************/

    rammitMQChannel.assertQueue('userCreatedTasks', {durable: false});
    rammitMQChannel.consume('userCreatedTasks', msg => {
        if(!msg) return;
        const task: task = JSON.parse(msg.content.toString());
        handleUserTask(task);
        rammitMQChannel.ack(msg)
    }, {});

    async function handleUserTask(task: task) {
        if(task.dimentions == 0) {
            const flat_iuv = await verifyFlattenDirectory(task.iuv);
            const flat_rgb = await verifyFlattenDirectory(task.rgb);
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
    /********** dataset handling *********************/
    async function make_db(driving_frames_dir: flatten_directory, real_frames_dir: flatten_directory){
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


})()