import useAuth from '../../hooks/useAuth';

export default function Home() {
  const { user } = useAuth();
  return <h1>Welcome {user}</h1>;
}
