import axios from '../../services/axios';

export default function TodoDetail() {
  axios.get('/todo/1');
  return <h1>Todo</h1>;
}
