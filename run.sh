systemctl start mongod
sudo systemctl status mongod

npx nodemon services/datasetPreperationService.ts &
# npx nodemon services/localTrainingServicce.ts &
npx nodemon services/trainingService.ts &
npx nodemon index.ts &


