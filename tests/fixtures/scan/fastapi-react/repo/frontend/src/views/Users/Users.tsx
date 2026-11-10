import axios from '../../services/axios';

export default function Users() {
  axios.get('/users');
  return <h1>Users</h1>;
}
