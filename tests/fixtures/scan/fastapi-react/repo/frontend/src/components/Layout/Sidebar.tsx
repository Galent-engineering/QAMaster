import useAuth from '../../hooks/useAuth';

export default function Sidebar() {
  const { user } = useAuth();
  return <aside>{user ? <a href="/todo">Todos</a> : null}</aside>;
}
