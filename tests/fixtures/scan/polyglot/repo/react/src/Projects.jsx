export function Projects() {
  const navigate = useNavigate();
  return <div><Link to="/settings">Settings</Link><button onClick={() => navigate('/projects/42')}>Open</button></div>;
}
export const ProjectPage = () => <NavLink to="../">Up</NavLink>;
