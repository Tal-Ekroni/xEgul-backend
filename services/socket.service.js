const asyncLocalStorage = require("./als.service");
const logger = require("./logger.service");

var gIo = null;
let rooms = [];
function connectSockets(http, session) {
  gIo = require("socket.io")(http, {
    cors: {
      origin: "*",
    },
  });

  gIo.on("connection", (socket) => {
    socket.playerId = socket.id;
    console.log(socket.id);
    socket.on("disconnect", (socket) => {
      console.log("Someone disconnected");
    });
    socket.on("enter game room", (room) => {
      if (socket.myRoomId === room.roomId) return;
      if (socket.myRoomId) {
        socket.leave(socket.myRoomId);
      }
      socket.join(room.roomId);
      socket.myRoomId = room.roomId;
      let myIdx;
      if (!rooms[socket.myRoomId]) {
        rooms[socket.myRoomId] = room;
        if (rooms[socket.myRoomId].playersCount >= 2) return;

        rooms[socket.myRoomId].players[0].id = socket.playerId;
        rooms[socket.myRoomId].playersCount++;
      } else {
        rooms[socket.myRoomId].players[1].id = socket.playerId;
        rooms[socket.myRoomId].playersCount++;
        rooms[socket.myRoomId].gameOn = true;
        gIo.to(socket.playerId).emit("im second", 1);
        gIo.to(socket.playerId).emit("start game", rooms[socket.myRoomId]);
      }

      gIo
        .to(socket.myRoomId)
        .emit("update room players", rooms[socket.myRoomId]);
    });
    socket.on("new move", ({ room, board }) => {
      gIo.to(socket.myRoomId).emit("update new move", { room, board });
    });
    socket.on("left game", (playerIdx) => {
      if (rooms[socket.myRoomId]) {
        rooms[socket.myRoomId].playersCount--;
        rooms[socket.myRoomId].players[playerIdx].id = null;
        if (!rooms[socket.myRoomId].playersCount) rooms[socket.myRoomId] = null;
      }
      console.log(rooms);
    });
  });
}

function emitTo({ type, data, label }) {
  if (label) gIo.to("watching:" + label).emit(type, data);
  else gIo.emit(type, data);
}

async function emitToUser({ type, data, userId }) {
  logger.debug("Emiting to user socket: " + userId);
  const socket = await _getUserSocket(userId);
  if (socket) socket.emit(type, data);
  else {
    console.log("User socket not found");
    _printSockets();
  }
}

// Send to all sockets BUT not the current socket
async function broadcast({ type, data, room = null, userId }) {
  console.log("BROADCASTING", JSON.stringify(arguments));
  const excludedSocket = await _getUserSocket(userId);
  if (!excludedSocket) {
    logger.debug("Shouldnt happen, socket not found");
    _printSockets();
    return;
  }
  logger.debug("broadcast to all but user: ", userId);
  if (room) {
    excludedSocket.broadcast.to(room).emit(type, data);
  } else {
    excludedSocket.broadcast.emit(type, data);
  }
}

async function _getUserSocket(userId) {
  const sockets = await _getAllSockets();
  const socket = sockets.find((s) => s.userId == userId);
  return socket;
}
async function _getAllSockets() {
  // return all Socket instances
  const sockets = await gIo.fetchSockets();
  return sockets;
}
// function _getAllSockets() {
//     const socketIds = Object.keys(gIo.sockets.sockets)
//     const sockets = socketIds.map(socketId => gIo.sockets.sockets[socketId])
//     return sockets;
// }

async function _printSockets() {
  const sockets = await _getAllSockets();
  console.log(`Sockets: (count: ${sockets.length}):`);
  sockets.forEach(_printSocket);
}
function _printSocket(socket) {
  console.log(`Socket - socketId: ${socket.id} userId: ${socket.userId}`);
}

module.exports = {
  connectSockets,
  emitTo,
  emitToUser,
  broadcast,
};
