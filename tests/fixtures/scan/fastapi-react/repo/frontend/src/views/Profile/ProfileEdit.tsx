import axios from '../../services/axios';
import ProfileForm from './ProfileForm';

export default function ProfileEdit() {
  axios.get('/users/me');
  return <ProfileForm />;
}
