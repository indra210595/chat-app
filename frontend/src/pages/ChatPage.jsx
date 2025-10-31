import { useEffect, useRef, useState } from "react";
import { useAuth  } from "../context/AuthContext.jsx";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket";
import { 
    fetchUsers, 
    fetchMessages, 
    markMessageAsRead,
    createGroup,
    fetchGroups,
    fetchGroupMessages,
    addMemberToGroup
} from "../services/api";

export default function ChatPage() {
    const { user, logout } = useAuth(); // user login
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [users, setUsers] = useState([]);
    const messagesEndRef = useRef(null);
    const [isTyping, setIsTyping] = useState(false); // state buat typing indicator
    const [onlineUsers, setOnlineUsers] = useState(new Set()); // state online
    const [lastSeen, setLastSeen] = useState({}); // state last seen
    const [unreadCounts, setUnreadCounts] = useState({}); // state jumlah pesan belum dibaca
    const [groups, setGroups] = useState([]); // state group
    const [selectedChat, setSelectedChat] = useState(null); // chat group / chat private
    const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false); // modal buat group
    const [newGroupName, setNewGroupName] = useState("");
    const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false); // modal nambah member ke grup
    const [groupMembers, setGroupMembers] = useState([]); // nambah member ke grup

    const typingTimeoutRef = useRef(null); // ref buat timer

    // buka modal
    const handleCreateGroup = () => {
        setIsCreateGroupModalOpen(true); 
    };

    // tutup modal
    const closeCreateGroupModal = () => {
        setIsCreateGroupModalOpen(false);
        setNewGroupName(""); // Kosongin input pas ditutup
    };

    const handleCreateGroupSubmit = async (e) => {
        e.preventDefault(); // Cegah form reload halaman
        if (!newGroupName.trim()) return;

        try {
            const res = await createGroup(newGroupName.trim());
            const newGroup = res.data;

            setGroups((prevGroups) => {
                const exists = prevGroups.some(g => g.id === newGroup.id);
                if (exists) return prevGroups;
                return [...prevGroups, newGroup];
            });

            setSelectedChat(newGroup);
            setNewGroupName("");
            closeCreateGroupModal(); // Tutup modal pas berhasil
        } catch (error) {
            console.log(error);
            alert("Failed to create group. Please try again.");
        }
    };

     // register user ke backend
    useEffect(() => {
        if (user && socket) {
            socket.emit("register", user.id);
        }
    }, [user]);

     // fetch group
    useEffect(() => {
        const getGroups = async () => {
            if (!user) return;
            try {
                const res = await fetchGroups();
                setGroups(res.data);
            } catch (err) {
                console.error("Fetch groups error:", err);
            }
        };
        getGroups();
    }, [user]);

     // fetch users
    useEffect(() => {
        const getUsers = async () => {
            if (!user) return; // pastikan user udah ada dulu
            try {
                const res = await fetchUsers();
                setUsers(res.filter((u) => u.id !== user.id));
            } catch (err) {
                console.error("Fetch users error:", err);
            }
        };
        getUsers();
    }, [user]);

    // USEEFFECT BUAT AMBIL RIWAYAT CHAT
    useEffect(() => {
        if (!selectedChat) {
            setMessages([]); // Kalo nggak ada user yang dipilih, kosongin chat
            setGroupMembers([]); // Kosongin member juga
            return;
        }

        const getHistory = async () => {
            try {
                let res;
                // CEK APA YANG DI-CHAT ITU USER ATAU GRUP
                const isGroupChat = selectedChat.admin_id !== undefined;

                if (isGroupChat) {
                    // Kalo grup, panggil API grup
                    res = await fetchGroupMessages(selectedChat.id);
                } else {
                    // Kalo user, panggil API private chat
                    res = await fetchMessages(selectedChat.id);
                }
                setMessages(res.data); // Isi state messages dengan riwayat

                // FETCH MEMBER
                if (selectedChat.admin_id !== undefined) {
                    const memberIds = new Set(res.data.map(m => m.sender_id).filter(id => id !== null));
                    const membersInGroup = users.filter(u => memberIds.has(u.id));
                    setGroupMembers(membersInGroup);
                } else {
                    setGroupMembers([]);
                }

                // TANDAI PESAN YANG BELUM DIBACA
                const unreadMessages = res.data.filter(
                    (msg) => !msg.is_read && msg.sender_id !== user.id
                );

                if (unreadMessages.length > 0) {
                    // Loop dan tandai satu-satu sebagai sudah dibaca
                    unreadMessages.forEach((msg) => {
                        markMessageAsRead(msg.id);
                    });
                }

                // RESET COUNT YANG DIPISAH
                if (isGroupChat) {
                    // Kalo grup, reset count berdasarkan ID grup
                    setUnreadCounts((prev) => ({
                        ...prev,
                        [selectedChat.id]: 0,
                    }));
                } else {
                    // Kalo private chat, reset count berdasarkan ID user lawan bicara
                    setUnreadCounts((prev) => ({
                        ...prev,
                        [selectedChat.id]: 0,
                    }));
                }
            } catch (err) {
                console.error("Fetch message history error:", err);
            }
        };

        getHistory();
    }, [selectedChat]); // Efek ini jalan setiap kali selectedChat berubah

    const sendMessage = (e) => {
        e.preventDefault();
        if (text.trim() && selectedChat) {
            // CEK APA YANG DI-CHAT ITU USER ATAU GRUP
            // Grup punya admin_id, user nggak
            const isGroupChat = selectedChat.admin_id !== undefined;

            const messageData = {
                content: text,
                sender_id: user.id,
                // KIRIM DATA YANG BEDA
                receiver_id: isGroupChat ? null : selectedChat.id,
                group_id: isGroupChat ? selectedChat.id : null,
            };
            socket.emit("sendMessage", messageData);
            setText("");
        }
    };

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    const filteredMessages = messages.filter((m) => {
        // CEK APA YANG DI-CHAT ITU USER ATAU GRUP
        const isGroupChat = selectedChat?.admin_id !== undefined;

        if (isGroupChat) {
            // Kalo grup, tampilkan semua pesan di grup itu
            return m.group_id === selectedChat.id;
        } else {
            // Kalo private chat
            return (
                (m.sender_id === user.id && m.receiver_id === selectedChat?.id) ||
                (m.sender_id === selectedChat?.id && m.receiver_id === user.id)
            );
        }
    });

    // buat scroll
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // effect auto scroll
    useEffect(() => {
        scrollToBottom();
    }, [filteredMessages]);

    const handleTyping = () => {
        // Pastikan kita hanya ngirim event kalo ada user yang dipilih
        if (!selectedChat) return;

        const isGroupChat = selectedChat.admin_id !== undefined;

        // Kirim event "lagi ngetik" ke server
        socket.emit("typing", {
            senderId: user.id,
            receiverId: isGroupChat ? null : selectedChat.id,
            groupId: isGroupChat ? selectedChat.id : null,
        });

        // Reset timer yang lama
        clearTimeout(typingTimeoutRef.current);

        // Set timer baru. Kalo dalam 1 detik nggak ada apa-apa, kirim event "berhenti ngetik"
        typingTimeoutRef.current = setTimeout(() => {
            socket.emit("stopTyping", {
                senderId: user.id,
                receiverId: isGroupChat ? null : selectedChat.id,
                groupId: isGroupChat ? selectedChat.id : null,
            });
        }, 1000); // 1000ms = 1 detik
    };

    useEffect(() => {
        // Jangan lakukan apa-apa kalo user belum login
        if (!user) return;
        if (user?.id) {
            socket.emit("setup", user);
        }

        // Listener untuk pesan baru
        const handleReceiveMessage = (message) => {
            // Apakah pesan ini untuk grup yang sekarang dibuka?
            const isForCurrentGroup = message.group_id && selectedChat?.id === message.group_id;
            // Apakah pesan ini untuk private chat yang sekarang dibuka?
            const isForCurrentPrivate = message.receiver_id && (selectedChat?.id === message.receiver_id || selectedChat?.id === message.sender_id);

            if (!isForCurrentGroup && !isForCurrentPrivate) {
                if (message.sender_id !== user.id) {
                    // INCREMENT COUNT YANG DIPISAH
                    if (message.group_id) {
                        // Kalo pesan dari grup, increment count berdasarkan ID grup
                        setUnreadCounts((prev) => ({
                            ...prev,
                            [message.group_id]: (prev[message.group_id] || 0) + 1,
                        }));
                    } else {
                        // Kalo pesan dari private chat, increment count berdasarkan ID pengirim
                        setUnreadCounts((prev) => ({
                            ...prev,
                            [message.sender_id]: (prev[message.sender_id] || 0) + 1,
                        }));
                    }
                }
                return;
            }

            setMessages((prevMessages) => {
                const exists = prevMessages.some((m) => m.id === message.id);
                return exists ? prevMessages : [...prevMessages, message];
            });
        };

        // Listener untuk read receipt
        const handleMessageRead = (data) => {
            setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                    msg.id === data.messageId ? { ...msg, is_read: true } : msg
                )
            );
        };

        // delete message
        const handleMessageDeleted = ({ id }) => {
            setMessages((prev) => prev.filter((m) => m.id !== id));
        };

         // Listener untuk "lagi ngetik"
        const handleUserTyping = (data) => {
            // kalo grup
            if (selectedChat?.admin_id !== undefined) {
                if (data.groupId === selectedChat.id && data.senderId !== user.id) {
                    setIsTyping(data.username || "Someone");
                }
            } else {
                // private
                if (data.senderId === selectedChat?.id) {
                    setIsTyping(true);
                }
            }
        };

        // Listener untuk "berhenti ngetik"
        const handleUserStoppedTyping = (data) => {
            if (selectedChat?.admin_id !== undefined) {
                if (data.groupId === selectedChat.id && data.senderId !== user.id) {
                    setIsTyping(false);
                }
            } else {
                if (data.senderId === selectedChat?.id) {
                    setIsTyping(false);
                }
            }
        };

        // USER ONLINE
        const handleUserOnline = (userId) => {
            setOnlineUsers((prev) => new Set(prev).add(userId));
        };

        // USER OFFLINE & LAST SEEN
        const handleUserOffline = ({ userId, lastSeen }) => {
            setOnlineUsers((prev) => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });
            setLastSeen((prev) => ({ ...prev, [userId]: lastSeen }));
        };

        // USER DITAMBAHKAN KE GRUP OLEH ADMIN
        const handleAddedToGroup = ({ groupId }) => {
            // Refresh daftar grup
            fetchGroups().then(res => setGroups(res.data));
        };
        
        const handleJoinedGroup = (newGroup) => {
            setGroups((prev) => {
                const exists = prev.some(g => g.id === newGroup.id);
                return exists ? prev : [...prev, newGroup];
            });
        };

        // ATTACH LISTENER
        socket.on("receiveMessage", handleReceiveMessage);
        socket.on("messageRead", handleMessageRead);
        socket.on("userTyping", handleUserTyping);
        socket.on("userStoppedTyping", handleUserStoppedTyping);
        socket.on("userOnline", handleUserOnline);
        socket.on("userOffline", handleUserOffline);
        socket.on("addedToGroup", handleAddedToGroup);
        socket.on("joinedGroup", handleJoinedGroup);
        socket.on("messageDeleted", handleMessageDeleted);

        // Cleanup listener pas komponen unmount
        return () => {
            socket.off("receiveMessage", handleReceiveMessage);
            socket.off("messageRead", handleMessageRead);
            socket.off("userTyping", handleUserTyping);
            socket.off("userStoppedTyping", handleUserStoppedTyping);
            socket.off("userOnline", handleUserOnline);
            socket.off("userOffline", handleUserOffline);
            socket.off("addedToGroup", handleAddedToGroup);
            socket.off("joinedGroup", handleJoinedGroup);
            socket.off("messageDeleted", handleMessageDeleted);
        };
    }, [user, selectedChat]); // supaya listener-nya update terus pas ganti chat.

    const handleDeleteMessage = async (messageId) => {
        if (!window.confirm("Delete this message?")) return;
        socket.emit("deleteMessage", {
            messageId,
            senderId: user.id,
        });
        // Optimistic UI: hapus langsung dari state
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
    };


    // last seen time format
    const formatTime = (dateString) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    };

    // BUAT ADD MEMBER
    const handleAddMember = async (userIdToAdd) => {
        if (!selectedChat || selectedChat.admin_id === undefined) return;

        try {
            await addMemberToGroup(selectedChat.id, userIdToAdd);
            
            // Optimistic UI: langsung update state member
            const userToAdd = users.find(u => u.id === userIdToAdd);
            if (userToAdd) {
                setGroupMembers(prev => [...prev, userToAdd]);
            }
            
            alert("Member added successfully!");
            setIsAddMemberModalOpen(false);

        } catch (error) {
            console.error("Error adding member:", error);
            alert("Failed to add member.");
        }
    };

    return (
        <div className="flex h-screen">
            {/* sidebar group & user */}
            <div className="w-1/4 border-r p-4 overflow-y-auto">
                <h2 className="text-lg font-semibold mb-2">Chats</h2>
                {/* List group */}
                <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-600 mb-1">Groups</h3>
                    {/* button buat group */}
                    <button
                        onClick={handleCreateGroup}
                        className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
                    >
                        +
                    </button>
                    {groups.map((group) => {
                        const unreadCount = unreadCounts[group.id] || 0;
                        return (
                            <button
                                key={group.id}
                                onClick={() => setSelectedChat(group)}
                                className={`relative w-full text-left p-2 rounded mb-1 flex items-center gap-2 transition-colors ${
                                    selectedChat?.id === group.id ? "bg-blue-500 text-white" : "hover:bg-gray-100"
                                }`}
                            >
                                <div className="relative flex-shrink-0">
                                    {/* Icon grup */}
                                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                                        <span className="text-white font-bold">G</span>
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`font-semibold truncate ${selectedChat?.id === group.id ? "text-white" : "text-gray-900"}`}>
                                        {group.name}
                                    </p>
                                </div>
                                {unreadCount > 0 && (
                                    <span
                                        className={`absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold border-2 ${
                                            selectedChat?.id === group.id
                                                ? "bg-white text-blue-500 border-white"
                                                : "bg-red-500 text-white border-gray-100"
                                        }`}
                                    >
                                        {unreadCount > 99 ? "99+" : unreadCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Private Chat */}
                <div>
                    <h3 className="text-sm font-semibold text-gray-600 mb-1">Direct Messages</h3>
                    {users.map((u) => {
                        const isOnline = onlineUsers.has(u.id);
                        const userLastSeen = lastSeen[u.id];
                        const unreadCount = unreadCounts[u.id] || 0;

                        return (
                            <button
                                key={u.id}
                                onClick={() => setSelectedChat(u)}
                                className={`relative w-full text-left p-2 rounded mb-1 flex items-center gap-2 transition-colors ${
                                    selectedChat?.id === u.id ? "bg-blue-500 text-white" : "hover:bg-gray-100"
                                }`}
                            >
                                <div className="relative flex-shrink-0">
                                    <img src={`https://ui-avatars.com/api/?name=${u.username}&background=random`} alt={u.username} className="w-10 h-10 rounded-full" />
                                    { unreadCount > 0 && ( 
                                        <span
                                            className={`absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold border-2 ${
                                                selectedChat?.id === u.id
                                                    ? "bg-white text-blue-500 border-white"
                                                    : "bg-red-500 text-white border-gray-100"
                                            }`}
                                        >
                                        {unreadCount > 99 ? "99+" : unreadCount}
                                        </span> )}
                                    <span 
                                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${selectedChat?.id === u.id ? "border-blue-500" : "border-white"} ${isOnline ? "bg-green-500" : "bg-gray-400"}`}>
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`font-semibold truncate ${selectedChat?.id === u.id ? "text-white" : "text-gray-900"}`}>{u.username}</p>
                                    <p className="text-xs truncate"> 
                                        { isOnline ? (
                                            <span className={selectedChat?.id === u.id ? "text-blue-100" : "text-green-600"}>
                                                Online
                                            </span>
                                        ) : (
                                            <span className={selectedChat?.id === u.id ? "text-blue-100" : "text-gray-500"}>
                                                {userLastSeen ? `Last seen: ${formatTime(userLastSeen)}` : "Offline"}
                                            </span>
                                        )} 
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <button onClick={handleLogout} className="text-sm bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 mt-4">
                    Logout
                </button>
            </div>

            {/* chat area */}
            <div className="flex-1 flex flex-col p-4">
                {/* HEADER CHAT */}
                {selectedChat && (
                    <div className="p-2 border-b mb-2">
                        <div className="flex items-center justify-between p-2 border-b mb-2">
                            <h3 className="font-semibold">
                                {selectedChat.username || selectedChat.name}
                            </h3>
                            {/* TOMBOL INI HANYA MUNCUL UNTUK ADMIN GRUP */}
                            {selectedChat.admin_id !== undefined && selectedChat.admin_id === user.id && (
                                <button
                                    onClick={() => setIsAddMemberModalOpen(true)}
                                    className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                                >
                                    Add Member
                                </button>
                            )}
                        </div>
                        {/* kalau group, tampilkan list member di bawah nama */}
                        {selectedChat.admin_id !== undefined && groupMembers.length > 0 && (
                            <p 
                                title={groupMembers.map((m) => m.username).join(", ")}
                                className="text-xs text-gray-500 mt-1 truncate"
                            >
                                Members: {groupMembers.map((m) => m.username).join(", ")}
                            </p>
                        )}
                    </div>
                )}
                <div className="flex-1 border rounded p-2 overflow-y-auto mb-2 bg-gray-50">
                   { filteredMessages.map((msg, i) => (
                    <div
                        key={msg.id}
                        className={`group relative p-2 my-1 rounded-lg max-w-xs ${
                        msg.sender_id === user.id
                            ? "bg-blue-500 text-white ml-auto"
                            : "bg-gray-300 text-black mr-auto"
                        }`}
                    >
                        {msg.content}

                        {/* Tombol delete muncul pas hover & cuma buat pengirim */}
                        {msg.sender_id === user.id && (
                            <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="absolute top-1 right-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity text-white-200 hover:text-red-500"
                            >
                                ✕
                            </button>
                        )}

                        {/* check mark kalo pesan udah dibaca */}
                        {msg.sender_id === user.id && (
                            <span className="text-xs text-black-400">
                                {msg.is_read ? " ✓✓" : " ✓"}
                            </span>
                        )}
                        {/* timestamp */}
                        <span className="text-xs text-gray-400">
                            {formatTime(msg.created_at)}
                        </span>
                    </div>
                    ))}
                    {/* auto scroll */}
                    <div ref={messagesEndRef} />
                    {/* tampil status typing */}
                    {isTyping && (
                        <p className="text-gray-500 text-xs italic px-2">
                            {typeof isTyping === "string"
                            ? `${isTyping} is typing...`
                            : `${selectedChat?.username || selectedChat?.name} is typing...`}
                        </p>
                    )}
                </div>

                {selectedChat ? (
                    <form onSubmit={sendMessage} className="flex gap-2">
                        <input
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            handleTyping(); // call typing
                        }}
                        placeholder={`Kirim pesan ke ${selectedChat.username || selectedChat?.name}`}
                        className="border flex-1 px-3 py-2 rounded"
                        />
                        <button className="bg-blue-500 text-white px-4 rounded">Send</button>
                    </form>
                ) : (
                    <p className="text-gray-500 text-center">Pilih user untuk mulai chat</p>
                )}
            </div>

            {/* MODAL CREATE GROUP */}
            {isCreateGroupModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96">
                        <h2 className="text-xl font-bold mb-4">Create New Group</h2>
                        <form onSubmit={handleCreateGroupSubmit}>
                            <input
                                type="text"
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                placeholder="Group name"
                                className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                autoFocus // Biar cursor langsung fokus ke input
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button" // type="button" biar nggak submit form
                                    onClick={closeCreateGroupModal}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                >
                                    Create
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* MODAL ADD MEMBER BARU */}
            {isAddMemberModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">Add Member to {selectedChat?.name}</h2>
                        
                        {/* List user yang bisa ditambahin */}
                        <div className="mb-4">
                            {users
                                .filter(u => !groupMembers.some(m => m.id === u.id)) // Filter user yang bukan member
                                .map(u => (
                                    <div key={u.id} className="flex items-center justify-between p-2 hover:bg-gray-100 rounded">
                                        <span>{u.username}</span>
                                        <button
                                            onClick={() => handleAddMember(u.id)}
                                            className="text-xs bg-blue-500 text-white px-2 py-1 rounded"
                                        >
                                            Add
                                        </button>
                                    </div>
                                ))}
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setIsAddMemberModalOpen(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
