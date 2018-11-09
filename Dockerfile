FROM justadudewhohacks/opencv-nodejs:node9-opencv3.4.1-contrib

WORKDIR /app

COPY ./package.json /app/package.json
RUN npm install -g nodemon forever && npm install

COPY ./src /app/src

#CMD ["nodemon", "-L", "./src/server.js"]
CMD ["forever", "--watch", "./src/server.js", "start"]
