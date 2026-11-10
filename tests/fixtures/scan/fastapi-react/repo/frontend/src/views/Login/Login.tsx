import useAuth from '../../hooks/useAuth';
import LoginForm from './LoginForm';

export default function Login() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? null : <LoginForm />;
}
