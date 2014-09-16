var app = require("http").createServer(handler);
var io = require("socket.io")(app);
var fs = require("fs");
var url = require("url");
var MongoClient = require("mongodb").MongoClient;
var pswrdHSH = require("password-hash");
//var az = require("azure");

var port = process.env.PORT || 1337;
var peeringKey = 'oyf56g0ky07r2j4i';

app.listen(8888);

var users = {};

mongodb = null
console.log("Initializing MongoDB");
MongoClient.connect("mongodb://localhost:27017/ff", function(err, db) {
	if(err) {console.log(err); return;}
	db.collection('users', function(err, col) {
		if (err) {console.log(err); return;}	
	});
	mongodb = db;
});
console.log("MongoDB (finally) setup: "+mongodb);

function log(t) {
	console.log('[' + (new Date()).toJSON() + '] ' + t);
}

function handler(req, res) {
	var path = url.parse(req.url).pathname.slice(1);
	if (path === "") {path = "index.htm";}
	fs.readFile(path,
	function (err, data) {
		if (err) {
			console.log(err);
			res.writeHead(500);
			return res.end("Error loading page");
		}
		res.writeHead(200);
		res.end(data);
	});
}

io.on('connection', function(socket) {

	log('Connected to a client');
	var nick;
	var sessionID;

	function getFriends(col) {
		col.findOne({'_id': nick}, function(err, item) {
			socket.emit('get-friends', {friends: item.friends});
		});

	}
	
	socket.on("log-in", function(data) {
		if(!mongodb) {log("MongoDB down"); socket.emit('error', {err: "The database appears to be down..."}); return;}
		mongodb.collection('users', function(err, col) {
			col.findOne({_id: data.name}, function(err, item) {
				if (err || !item) {log("User does not exist"); socket.emit('invalid-login', {err: "User does not exist"}); return;}
				if (!pswrdHSH.verify(data.pswrd, item.pswrd_hsh)) {log("Invalid password"); socket.emit('invalid-login', {err: "Invalid username or password"}); return;}

				nick = data.name;
				log('User ' + nick + ' logged in');
				sessionID = Math.floor(Math.random() * 1000000);
				users[nick] = {"socket": socket, sessionid: sessionID};
				socket.emit('session-auth', {key: sessionID, APIKey: peeringKey});
				getFriends(col);
			});
		});
	});

	socket.on("new-user", function(data) {
		if(!mongodb) socket.emit('error', {err: "The database appears to be down..."});
		mongodb.collection('users', function(err, col) {
			col.insert({_id: data.name, pswrd_hsh: pswrdHSH.generate(data.pswrd), friends: []}, function(err, item) {
				if (err) {socket.emit('invalid-login', {err: "User already exists"}); log("User " + data.name + " already exists");}
				nick = data.name;
				log('User ' + nick + 'created');
				sessionID = Math.floor(Math.random() * 1000000);
				users[nick] = {'socket': socket, sessionid: sessionID};
				socket.emit('session-auth', {key: sessionID, APIKey: peeringKey});
				getFriends(col);
			});
		});
	});

	socket.on("add-friend", function(data) {
		if(!mongodb) socket.emit('error', {err: "The database appears to be down..."});
		if (data.name === nick) {log("User tried to friend self. Ha!"); return;}
		mongodb.collection('users', function(err, col) {
			col.findOne({_id: data.name}, function(err, item) {
				if (err || !item) {log("User not found: " + data.name + " " + item + " " + err); return;}
				col.update({_id: nick}, {"$addToSet": {friends: data.name}}, function(err, item) {
					if (err) {log("Adding friend " + data.name + " to " + nick + "'s friend list failed: " + err); return;}
					log("Adding friend " + data.name + " to " + nick + "'s friend list succeeded");
					getFriends(col);
				});
			});
		});
	});

	socket.on('request-remote-session-id', function(data) {
		log("Got a request for a peering session id");
		if(!mongodb) {log("MongoDB is down..."); return;}
		mongodb.collection('users', function(err, col) {
			if (err) {log(err); return;}
			col.findOne({_id: data.to}, function (err, item) {
				if (err) {log(err); return;}
				if (item.friends.indexOf(nick) > -1) {
					log("Sending file transfer request from " + nick  + " to " + data.to);
					users[data.to].socket.emit('request-file-transfer', {name: nick, filename: data.filename});
				} else {
					log(nick + ' has not been added by ' + data.to + '; not initiating transfer');
				}
			});
		});
	});

	socket.on('send-remote-session-id', function(data) {
		log("Reiceived file transfer confirmation; sending session key");
		users[data.to].socket.emit('get-remote-session-id:'+nick, {session: sessionID});
	});

	socket.on("get-friends", function(data) {
		log("Got request for friends");
		if(!mongodb) socket.emit('error', {err: "The database appears to be down..."});
		mongodb.collection('users', function(err, col) {
			col.findOne({'_id': nick}, function(err, item) {
				socket.emit('get-friends', {friends: item.friends});
			});
		});
	});

	socket.on("disconnect", function(data) {
		log('User ' + nick + ' disconnected');
		delete users[nick];
	});
});
