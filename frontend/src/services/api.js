import axios from "axios";

const API = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL}`, // backend url
});

// interceptor buat otomatis masukin token ke header
API.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const fetchUsers = async () => {
    try {
        const response = await axios.get("http://localhost:5000/api/auth/users"); 
        return response.data;
    } catch (error) {
        console.error("API fetchUsers error:", error);
        throw error;
    }
};

export const fetchMessages = (receiverId) => {
    return API.get(`/messages/${receiverId}`);
};

export const markMessageAsRead = (messageId) => {
    return API.put(`/messages/${messageId}/read`);
};

// GRUP
export const createGroup = (groupName) => {
    return API.post("/groups", { name: groupName });
};

export const fetchGroups = () => {
    return API.get("/groups");
};

export const fetchGroupMessages = (groupId) => {
    return API.get(`/messages/group/${groupId}`);
};

export const addMemberToGroup = (groupId, userId) => {
    return API.post(`/groups/${groupId}/members`, { userId });
};

export default API;
