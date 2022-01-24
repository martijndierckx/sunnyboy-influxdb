<<<<<<< HEAD
FROM node:10

# Create app directory
RUN mkdir -p /usr/src/sma-influxdb
WORKDIR /usr/src/sma-influxdb

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm install --only=production
=======
FROM node:16

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production
>>>>>>> 23fc9a2 (influx2 + docker-compose + cleanup)

# Bundle app source
COPY . .

<<<<<<< HEAD
CMD [ "npm", "start" ]
=======
CMD [ "node", "dist/index.js" ]
>>>>>>> 23fc9a2 (influx2 + docker-compose + cleanup)
