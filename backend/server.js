import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
// import helmet from "helmet";
import morgan from 'morgan';
import pool from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";

dotenv.config();
const app = express();

app.use(express.json()); // pake json
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: "http://localhost:5173" }));
// app.use(helmet());
app.use(morgan('dev'));

// Buat HTTP server
const server = http.createServer(app);
// Setup Socket.IO
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173", // frontend (vite)
        methods: ["GET", "POST"],
        credentials: true
    },
    path: "/socket.io/",
});
// OPER IO KE ROUTES
app.use((req, res, next) => {
    req.io = io; // Nempelin io ke object request
    next();
});

// Event socket
const onlineUsers = new Map(); // Simpan userId -> socketId
const lastSeen = new Map(); // Simpan userId -> timestamp
io.on("connection", (socket) => {
    // console.log("A user connected with socket id:", socket.id);
    // private chat
    socket.on("setup", (data) => {
        socket.join(data.id.toString());
    });


    // info typing
    socket.on("typing",async (data) => {
        const { senderId, receiverId, groupId } = data;

        try {
            // ambil username si pengirim
            const result = await pool.query("SELECT username FROM users WHERE id = $1", [senderId]);
            const username = result.rows[0]?.username || "Unknown";

            if (groupId) {
                socket.to(`group_${groupId}`).emit("userTyping", {
                    senderId,
                    username,
                    groupId,
                });
            } else if (receiverId) {
                socket.to(receiverId).emit("userTyping", { senderId, username });
            }
        } catch (err) {
            console.error("Error fetching username for typing event:", err);
        }
    });

    socket.on("stopTyping", (data) => {
        const { senderId, receiverId, groupId } = data;
        //console.log(`User ${data.senderId} stopped typing to ${data.receiverId}`);
        if (groupId) {
            socket.to(`group_${groupId}`).emit("userStoppedTyping", { senderId, groupId });
        } else if (receiverId) {
            socket.to(receiverId).emit("userStoppedTyping", { senderId });
        }
    });

    // join room
    socket.on("register",async (userId) => {
        socket.userId = userId; // Simpan userId di object socket
        socket.join(userId);    // Masukin user ke room dengan nama userId
        onlineUsers.set(userId, socket.id); // Tandai user sebagai ONLINE

        try {
            // ambil semua grup tempat user ini jadi anggota
            const result = await pool.query(
            "SELECT group_id FROM group_members WHERE user_id = $1",
            [userId]
            );

            result.rows.forEach(({ group_id }) => {
            socket.join(`group_${group_id}`); // join room grup
            });

            console.log(
            `User ${userId} joined rooms:`,
            result.rows.map((r) => `group_${r.group_id}`)
            );
        } catch (err) {
            console.error("Error joining group rooms:", err);
        }
        
        // Kasih tahu semua orang (kecuali user ini) kalau dia online
        socket.broadcast.emit("userOnline", userId);
    });

    // terima pesan dari client
    socket.on("sendMessage",async (data) => {
        // console.log(`Message received from ${data.sender_id} to ${data.receiver_id}:`, data.content);
        const { content, sender_id, receiver_id, group_id } = data;
        try {
            let newMessage; 

            if(group_id){
                // kalo group chat
                const result = await pool.query(
                    'INSERT INTO messages (content, sender_id, group_id) VALUES ($1, $2, $3) RETURNING *',
                    [content, sender_id, group_id]
                );
                newMessage = result.rows[0];

                // Kirim ke semua member di grup (kecuali sender)
                io.to(`group_${group_id}`).emit("receiveMessage", newMessage);
                io.to(sender_id).emit("receiveMessage", newMessage);
            } else if(receiver_id){
                // kalo private chat
                const result = await pool.query(
                    'INSERT INTO messages (content, sender_id, receiver_id) VALUES ($1, $2, $3) RETURNING *',
                    [content, sender_id, receiver_id]
                );
                newMessage = result.rows[0];

                // broadcast ke penerima + sender
                io.to(receiver_id).emit("receiveMessage", newMessage);
                io.to(sender_id).emit("receiveMessage", newMessage);
            }
        } catch (error) {
            console.error("Error saving message:", error);
        }
    });

    // hapus pesan (realtime)
    socket.on("deleteMessage", async (data) => {
        const { messageId, senderId } = data;

        try {
            // ambil pesan buat verifikasi sender
            const check = await pool.query("SELECT * FROM messages WHERE id = $1", [messageId]);
            if (check.rows.length === 0) return;
            const message = check.rows[0];

            // pastikan cuma pengirim yang bisa hapus
            if (message.sender_id !== senderId) return;

            // hapus dari DB
            await pool.query("DELETE FROM messages WHERE id = $1", [messageId]);

            // broadcast ke semua klien terkait
            if (message.group_id) {
                io.to(`group_${message.group_id}`).emit("messageDeleted", { id: messageId });
            } else {
                io.to(message.receiver_id.toString()).emit("messageDeleted", { id: messageId });
                io.to(senderId.toString()).emit("messageDeleted", { id: messageId });
            }
        } catch (error) {
            console.error("Error deleting message:", error);
        }
    });


    socket.on("disconnect", () => {
        const userId = socket.userId;
        if (userId) {
            //console.log(`User ${userId} disconnected`);
            
            // Hapus dari daftar online
            onlineUsers.delete(userId);

            // Simpan waktu last seen
            lastSeen.set(userId, new Date().toISOString());

            // Kasih tahu semua orang kalau dia offline, beserta last seen-nya
            socket.broadcast.emit("userOffline", { 
                userId, 
                lastSeen: lastSeen.get(userId) 
            });
        }
    });
});

// auth routes
app.use("/api/auth", authRoutes);
// message routes
app.use("/api/messages", messageRoutes);
// group routes
app.use("/api/groups", groupRoutes);

// test server
app.get('/', async(req, res) => {
    try {
        const result = await pool.query("select now()");
        res.json({
            message : "success",
            data : result.rows[0].now
        });
    } catch (err) {
        res.status(500).json({
            message : "error",
            error : err.message
        })
    }
});

const PORT = process.env.SERVER_PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port: ${PORT}`));