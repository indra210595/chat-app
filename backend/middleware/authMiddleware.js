import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith("Bearer ")){
        return res.status(401).json({
            message : "Access denied, no token provided!"
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_KEY);
        req.user = decoded; // bisa dipakai di controller
        // console.log("Decoded token:", decoded);
        next();
    } catch (err) {
        res.status(401).json({
            message: "Invalid or expired token."
        });
    }
};