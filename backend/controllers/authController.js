import bycrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import {registerSchema, loginSchema} from "../validations/authValidations.js";

// register
export const register = async (req, res) => {
    const {error} = registerSchema.validate(req.body);
    if(error){
        return res.status(400).json({
            message : error.details[0].message
        });
    };
    const {username, email, password} = req.body;
    try {
        // cek email
        const emailCheck = await pool.query(
            "select email from users where email = $1",
            [email]
        );
        // kalo email ada
        if(emailCheck.rows.length > 0){
            return res.status(400).json({
                message : "Email sudah ada!"
            });
        };

        // hash password
        const hashPassword = await bycrypt.hash(password, 10);

        // simpan user baru
        const newUser = await pool.query(
            "insert into users (username, email, password) values ($1, $2, $3) returning username, email, created_at",
            [username, email, hashPassword]
        );
        res.status(201).json({
            message : "User berhasil disimpan!",
            data : newUser.rows[0]
        });
    } catch (err) {
        res.status(500).json({
            message : err.message
        });
    }
};

// login
export const login = async (req, res) => {
    const {error} = loginSchema.validate(req.body);
    if(error){
        return res.status(400).json({
            message : error.details[0].message
        });
    };
    const {email, password} = req.body;
    try {
        // check user
        const user = await pool.query(
            "select * from users where email = $1",
            [email]
        );
        // kalo email tidak ada
        if(user.rows.length === 0){
            return res.status(400).json({
                message : "Invalid Email atau Password"
            });
        };

        const passwordCheck = await bycrypt.compare(password, user.rows[0].password);
        // kalo password tidak sama
        if(!passwordCheck){
            return res.status(400).json({
                message : "Invalid Email atau Password"
            });
        };
        // buat token
        const token = jwt.sign(
            {
                id : user.rows[0].id,
                username : user.rows[0].username,
                email : user.rows[0].email
            }, process.env.JWT_KEY,
            {
                expiresIn : "1d"
            }
        );

        res.json({
            message : "Login success",
            token,
            data : {
                id : user.rows[0].id,
                username : user.rows[0].username,
                email : user.rows[0].email
            }
        });
    } catch (err) {
        res.status(500).json({
            message : err.message
        });
    }
};