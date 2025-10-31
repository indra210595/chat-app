import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import pool from '../config/db.js';

const router = express.Router();

// RIWAYAT CHAT PRIVATE
router.get('/:receiverId', verifyToken, async (req, res) => {
    const { receiverId } = req.params;
    const senderId = req.user.id; // dari token

    try {
        const result = await pool.query(
            `SELECT * FROM messages 
             WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1) 
             ORDER BY created_at ASC`,
            [senderId, receiverId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching message history' });
    }
});

// BUAT TANDAI BACA
router.put('/:messageId/read', verifyToken, async (req, res) => {
    const { messageId } = req.params;
    const readerId = req.user.id; // user yang lagi buka chat

    try {
        // ambil data pesan
        const messageResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
        if (messageResult.rows.length === 0) {
            return res.status(404).json({ message: "Message not found" });
        }
        const message = messageResult.rows[0];

        // cek apakah ini pesan dari diri sendiri
        if (message.sender_id === readerId) {
            return res.status(400).json({ message: "You cannot mark your own message as read" });
        }

        // lakukan pengecekan berdasarkan tipe pesan
        let isAuthorized = false;
        if (message.group_id) {
            // pesan grup, cek apakah user ini member dari grup ini.
            const memberCheck = await pool.query(
                'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
                [message.group_id, readerId]
            );
            isAuthorized = memberCheck.rows.length > 0;
        } else {
            // pesan private, cek apakah user ini adalah penerimanya.
            isAuthorized = message.receiver_id === readerId;
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: "You are not authorized to read this message" });
        }

        // update status pesan jadi 'sudah dibaca'
        await pool.query('UPDATE messages SET is_read = true WHERE id = $1', [messageId]);

        // kirim notifikasi ke pengirim
        req.io.to(message.sender_id).emit("messageRead", { messageId });

        res.status(200).json({ message: "Message marked as read" });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// HAPUS PESAN
router.delete('/:messageId', verifyToken, async (req, res) => {
    const { messageId } = req.params;
    const userId = req.user.id;

    try {
        // cek dulu apakah pesan ini punya user yg login
        const check = await pool.query(
            'SELECT * FROM messages WHERE id = $1',
            [messageId]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({ message: 'Message not found' });
        }

        const message = check.rows[0];
        if (message.sender_id !== userId) {
            return res.status(403).json({ message: 'You can only delete your own messages' });
        }

        // hapus dari db
        await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);

        // kirim event ke semua member (private atau grup)
        if (message.group_id) {
            req.io.to(`group_${message.group_id}`).emit('messageDeleted', { id: messageId });
        } else {
            req.io.to(message.receiver_id.toString()).emit('messageDeleted', { id: messageId });
            req.io.to(userId.toString()).emit('messageDeleted', { id: messageId });
        }

        res.status(200).json({ message: 'Message deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});


// RIWAYAT CHAT GRUP
router.get('/group/:groupId', verifyToken, async (req, res) => {
    const { groupId } = req.params;
    const senderId = req.user.id;

    try {
        // Cek dulu apakah user ini memang member grupnya
        const memberCheck = await pool.query(
            'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
            [groupId, senderId]
        );
        // kalo bukan
        if (memberCheck.rows.length === 0) {
            return res.status(403).json({ message: 'You are not a member of this group' });
        }

        const result = await pool.query(
            `SELECT m.*, u.username 
             FROM messages m 
             JOIN users u ON m.sender_id = u.id 
             WHERE m.group_id = $1 
             ORDER BY m.created_at ASC`,
            [groupId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching group message history' });
    }
});

export default router;