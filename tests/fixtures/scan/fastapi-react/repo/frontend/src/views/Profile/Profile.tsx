import axios from '../../services/axios';

export default function Profile() {
  axios.get('/users/me');
  return <h1>Profile</h1>;
}
