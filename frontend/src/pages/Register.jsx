import { useNavigate, Link } from "react-router-dom";
import { useAuth  } from "../context/AuthContext.jsx";
import AuthForm from "../components/AuthForm";
import { socket } from "../socket";

const Register = () => {
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleRegister = async (data) => {
        try {
            await register(data.username, data.email, data.password);
            socket.connect();
            navigate("/login");
        } catch (err) {
            alert(err.response?.data?.message || "Register failed");
        }
    };

    return <AuthForm title="Create Account" onSubmit={handleRegister} isRegister />;
};

export default Register;
