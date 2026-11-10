import axios from '../../services/axios';

export default function Register() {
  return <form onSubmit={() => axios.post('/register', {})}><input name="email" maxLength={60} /></form>;
}
