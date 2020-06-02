const fs = require('fs');
var express = require('express')
var app = express();
var https = require("https");
const dotenv = require('dotenv');
dotenv.config();

app.use(express.static(__dirname));

// const presigned = require()

const privateKey = fs.readFileSync('sslcert/server.key');
const certificate = fs.readFileSync('sslcert/server.crt');

const credentials = {key: privateKey, cert: certificate};


var server = https.createServer(credentials, app);

var io = require("socket.io")(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
  cookie: false,
  maxHttpBufferSize: 10e9
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});



app.get('/presigned', (req, res) => {
  res.status(200).json({
    url: "someurlwillbesent"
  })
})

io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("message", (value) => {
    io.emit("message", value);
  });


  socket.on("agent_msg", (value) => {
    io.emit("agent_msg", value);
  });


  socket.on("fileUpload", (data)=>{    
    io.emit("fileUpload", data);
  })


  socket.on("customer_msg", (value) => {
    console.log("customer message received")
    io.emit("customer_msg", value);
  });


  socket.on("info", message=>{
    console.log("started uploading file")
    socket.broadcast.emit("info", message)
  });

  socket.on("agent_status", (value) => {
    console.log("agent status received")
    io.emit("agent_status", value);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});


const port = process.env.port || 9898
server.listen(port, () => {
  console.log(`listening on *:${port}`);
});


// /home/ec2-user/cobrowsing-ui/certs

// http-server . > http.log 2>&1 &

// ../../certs/

// http-server -S -C cert.pem -o