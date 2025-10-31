import { useNavigate, Link } from "react-router-dom";
import { useAuth  } from "../context/AuthContext.jsx";
import AuthForm from "../components/AuthForm";
import { socket } from "../socket";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (data) => {
    try {
      await login(data.email, data.password);
      socket.connect();
      navigate("/chat");
    } catch (err) {
      alert(err.response?.data?.message || "Login failed");
    }
  };

  return <AuthForm title="Welcome Back" onSubmit={handleLogin} />;
};

export default Login;