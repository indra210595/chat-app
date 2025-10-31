import express from "express";
import { verifyToken } from '../middleware/authMiddleware.js';
import pool from "../config/db.js";

const router = express.Router();

// buat grup baru
router.post('/', verifyToken, async (req,res) => {
    const {name} = req.body;
    const adminId = req.user.id; // dari token

    // kalo nama group kosong
    if (!name) {
        return res.status(400).json({message: 'Group name is required'});
    }

    try {
        // pake transaction kalo gagal bakal di rollback
        await pool.query('BEGIN');

        // insert group baru
        const groupResult = await pool.query(
            "INSERT INTO groups (name, admin_id) values ($1, $2) RETURNING *",
            [name, adminId]
        )
        const newGroup = groupResult.rows[0];

        // tambahin admin sebagai member pertama
        await pool.query(
            'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)',
            [newGroup.id, adminId, 'admin']
        );

        await pool.query('COMMIT');

        // Emit event ke admin yang baru bikin grup
        req.io.to(adminId).emit('joinedGroup', newGroup);

        res.status(201).json(newGroup);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error creating group:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// get list group berdasarkan user id
router.get('/', verifyToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query(
            `SELECT g.*, gm.role, u.username as admin_name
             FROM groups g
             JOIN group_members gm ON g.id = gm.group_id
             JOIN users u ON g.admin_id = u.id
             WHERE gm.user_id = $1`,
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching groups:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// tambah member ke group
router.post('/:groupId/members', verifyToken, async (req, res) => {
    const { groupId } = req.params;
    const { userId } = req.body; // user id yang mau ditambahin
    const currentUserId = req.user.id;

    try {
        // Cek user adalah admin
        const adminCheck = await pool.query(
            'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2 AND role = $3',
            [groupId, currentUserId, 'admin']
        );
        // kalo bukan
        if (adminCheck.rows.length === 0) {
            return res.status(403).json({ message: 'Only admins can add members' });
        }

        // Cek user yang mau ditambahin udah ada di grup
        const memberCheck = await pool.query(
            'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
            [groupId, userId]
        );
        // kalo udah ada di group
        if (memberCheck.rows.length > 0) {
            return res.status(409).json({ message: 'User is already in the group' });
        }

        // Tambahin member baru
        await pool.query(
            'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)',
            [groupId, userId, 'member']
        );

        // Emit event ke user yang baru ditambahin
        req.io.to(userId).emit('addedToGroup', { groupId });

        res.status(200).json({ message: 'Member added successfully' });
    } catch (err) {
        console.error('Error adding member:', err);
        res.status(500).json({ message: 'Server error' });
    }
});


export default router;