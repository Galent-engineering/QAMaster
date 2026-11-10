import { useState } from 'react';
import useAuth from '../../hooks/useAuth';
import axios from '../../services/axios';
import AddUpdateTodoModal from './AddUpdateTodoModal';
import TodoCard from './TodoCard';

export default function TodoList() {
  const [todos, setTodos] = useState<{ id: number; title: string }[]>([]);
  const { user } = useAuth();
  axios.get('/todo').then((r) => setTodos(r.data));
  return <section><h1>{user}'s todos</h1><AddUpdateTodoModal />{todos.map((t) => <TodoCard key={t.id} {...t} />)}</section>;
}
