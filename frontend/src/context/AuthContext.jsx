import { createContext, useState, useContext, useEffect } from "react";
import api from "../services/api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // Tambahin state loading biar lebih smooth

  useEffect(() => {
    const loadUserFromToken = async () => {
      const token = localStorage.getItem("token");
      if (token) {
        // Kalo ada token, coba ambil data user dari backend
        try {
          // endpoint /api/auth/me
          const res = await api.get("/auth/me"); 
          setUser(res.data.user);
        } catch (error) {
          // Kalo token invalid atau ada error, hapus token dan biarkan user null
          console.error("Token invalid, logging out:", error);
          localStorage.removeItem("token");
        }
      }
      
      // Selesai loading, entah ada user atau nggak
      setLoading(false);
    };

    loadUserFromToken();
  }, []); // [] artinya cuma jalan sekali pas komponen pertama kali di mount

  const register = async (username, email, password) => {
    const res = await api.post("/auth/register", { username, email, password });
    setUser(res.data.data);
  };

  const login = async (email, password) => {
     try {
        const res = await api.post("/auth/login", { email, password });
        localStorage.setItem("token", res.data.token);
        setUser(res.data.data);
    } catch (error) {
        console.error("Login failed:", error.response?.data || error.message);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);