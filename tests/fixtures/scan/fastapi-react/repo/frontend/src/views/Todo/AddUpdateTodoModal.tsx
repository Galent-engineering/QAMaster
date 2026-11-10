import axios from '../../services/axios';

export default function AddUpdateTodoModal() {
  return <form onSubmit={() => axios.post('/todo', {})}><input name="title" maxLength={50} /><button>Save</button></form>;
}
