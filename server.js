var app = require("http").createServer(handler);
var io = require("socket.io")(app);
var fs = require("fs");
var url = require("url");
var mongo = require("mongodb");
var pswrdHSH = require("./lib/password-hash");
//var az = require("azure");

app.listen(8888);

var users = {};
mongoclient = mongo.MongoClient;
mongodb = null
while (!mongodb) {
	mongoClient.connect("mongodb://localhost:27017/friendlyfiles", function(err, db) {
		if(err) return;
		db.createCollection('users');
		mongodb = db;
	});
}

function handler(req, res) {
	fs.readFile(url.parse(req.url).pathname.slice(1),
	function (err, data) {
		if (err) {
			console.log(url.parse(req.url).pathname.slice(1));
			res.writeHead(500);
			return res.end("Error loading page");
		}
		res.writeHead(200);
		res.end(data);
	});
}

io.on('connection', function(socket) {
	console.log('Connected');
	var nick;
	socket.on("log-in", function(data) {
		if(!mongodb) socket.emit('error', {err: "The database appears to be down..."});
		mongodb.collection('users', function(err, col) {
			col.findOne({_id: data.name}, function(err, item) {
				if (err) socket.emit('invalid-login', {err: "User does not exist"});
				if (pswrdHSH.generate(data.pswrd) !== ) socket.emit('invalid-login', {err: "Invalid username or password"});

				nick = data.name;
				console.log('User ' + nick + ' logged in');
				users[nick] = {"socket": socket};
			});
		});
	});

	socket.on("new-user", function(data) {
		if(!mongodb) socket.emit('error', {err: "The database appears to be down..."});
		mongodb.collection('users', function(err, col) {
			col.insert({_id: data.name, pswrd_hsh: pswrdHSH.generate(data.pswrd), friends: []}, function(err, item) {
				if (err) socket.emit('invalid-login', {err: "User already exists"});
				console.log('User ' + nick + 'created');
				nick = data.name;
				users[nick] = {'socket': socket};
			});
		});
	});

	socket.on("add-friend", function(data) {
		if(!mongodb) socket.emit('error', {err: "The database appears to be down..."});
		mongodb.collection('users', function(err, col) {
			col.update({_id: nick}, {"$pushAll": [data.name]} function(err, item) {});
		});
	});

	socket.on("get-friends", function(data) {
		if(!mongodb) socket.emit('error', {err: "The database appears to be down..."});
		mongodb.collection('users', function(err, col) {
			col.findOne({'_id': nick}, function(err, item) {
				socket.emit('get-friends', {friends: item.friends});
			});
		});
	});

	socket.on("disconnect", function(data) {
		console.log('User ' + nick + 'disconnected');
		delete users[nick];
	});

	//pass on some messages
	for (var msg in ['req-file', 'recieve-cancelled', 'notify-sending', 'send-cancelled']) {
		socket.on(msg, function(data) {
			users[data.to].socket.emit(msg, data);
		});
	}
});
