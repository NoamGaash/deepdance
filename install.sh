# RabbitMQ

## add repo
echo 'deb http://www.rabbitmq.com/debian/ testing main' | sudo tee /etc/apt/sources.list.d/rabbitmq.list
wget -O- https://www.rabbitmq.com/rabbitmq-release-signing-key.asc | sudo apt-key add -
apt-get update

## install
apt-get install rabbitmq-server

## start
systemctl start rabbitmq-server
systemctl enable rabbitmq-server

## configure 
echo "Choose password for RabbitMQ (username: admin)"
read password
rabbitmqctl add_user admin $password
rabbitmqctl set_user_tags admin administrator
rabbitmqctl set_permissions -p / admin ".*" ".*" ".*"

rabbitmq-plugins enable rabbitmq_management
ufw allow 15672/tcp


# mongoDB
## install mongod
wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list
apt-get update
apt-get install -y mongodb-org

## start mongo
systemctl start mongod
sudo systemctl status mongod








