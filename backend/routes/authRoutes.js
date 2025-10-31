import express from "express";
import { register, login } from "../controllers/authController.js";
import { verifyToken } from '../middleware/authMiddleware.js';
import pool from "../config/db.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, username, email FROM users");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/me', verifyToken, async (req, res) => {
  // Middleware authenticateToken akan nambahin data user ke req.user
  try {
    const userQuery = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [req.user.id]);
    
    if (userQuery.rows.length > 0) {
      res.json({ user: userQuery.rows[0] });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


export default router;
