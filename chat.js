const uuid = require('uuid').v4;
const { Message } = require('./message');
const { User } = require('./user');
const { Room } = require('./room');
const { ChunkReceive } = require('./chunk-receive');
const { MediaChunk } = require('./media-chunk');

const ERROR_AUTH = 'Authentication error!';

class Chat{
    constructor(io){
        this.io = io;
        this.rooms = {};
        this.users = {};
        this.io.use((socket, next) => {
            try{
                this.#createUser(socket);
                next();
            }catch(e){
                console.log(e);
                next(e);
            }
        });
        this.io.on('connection', (socket) => this.#onConnection(socket));
    }

    getUsersCount(){
        return Object.keys(this.users).length;
    }

    getRoomCount(){
        return Object.keys(this.rooms).length;
    }

    #createUser(socket){
        let {userName, roomId, roomTitle} = socket.handshake.auth;
        if(!userName){
            throw new Error(ERROR_AUTH);
        }
        if(!roomId){
            roomId = uuid();
            this.rooms[roomId] = new Room(roomId, roomTitle);
        }else if(!this.rooms[roomId]){
            throw new Error(ERROR_AUTH);
        }
        const user = new User(socket, userName, roomId);
        this.users[socket.id] = user;
        this.rooms[roomId].users[socket.id] = user;
    }

    #onConnection(socket){
        console.log('User [' + socket.id + '] connected!');
        const user = this.users[socket.id];
        const room = this.rooms[user.roomId];
        
        socket.on('disconnect', () => this.#onDisconnect(socket));
        socket.on('message', (request) => this.#onMenssage(user, request));
        socket.on('media', (request) => this.#onMedia(user, request));
        
        socket.emit('room-info', room.dto());
        for(const id of Object.keys(room.users)){
            const other = room.users[id];
            other.socket.emit('enterer', user.dto());
        }
    }

    #onDisconnect(socket){
        console.log('User [' + socket.id + '] disconnected!');
        const user = this.users[socket.id];
        const roomId = user.roomId;
        const room = this.rooms[roomId];
        for(const id of Object.keys(room.users)){
            const other = room.users[id];
            other.socket.emit('exit', user.dto());
        }
        delete this.users[socket.id];
        delete room.users[socket.id];
        if(Object.keys(room.users).length == 0){
            delete this.rooms[roomId];
        }
    }

    #onMenssage(sender, request){
        const {content, type} = request;
        const room = this.rooms[sender.roomId];
        for(const id of Object.keys(room.users)){
            const user = this.users[id];
            user.socket.emit('message', new Message(sender.socket.id, sender.name, content, type));
        }
    }

    #onMedia(sender, request){
        const {dataChunk, dataIndex, dataLength, type} = request;
        const room = this.rooms[sender.roomId];
        for(const id in room.users){
            const user = room.users[id];
            user.socket.emit('media', new MediaChunk(sender.socket.id, sender.name, dataChunk, dataIndex, dataLength, type));
        }
        sender.socket.emit('chunk-send', new ChunkReceive(dataIndex, dataLength));
    }
}

module.exports = {
    Chat
};