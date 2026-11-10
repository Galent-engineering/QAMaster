import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Authenticated from './components/Auth/Authenticated';
import Layout from './components/Layout/Layout';
import Home from './views/Home/Home';
import Login from './views/Login/Login';
import Profile from './views/Profile/Profile';
import ProfileEdit from './views/Profile/ProfileEdit';
import Register from './views/Register/Register';
import TodoDetail from './views/Todo/TodoDetail';
import TodoList from './views/Todo/TodoList';
import Users from './views/Users/Users';

// the shape of finsberg/fastapi-react-app: every private screen is wrapped in <Authenticated>
export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Authenticated><Home /></Authenticated>} />
          <Route path="/todo" element={<Authenticated><TodoList /></Authenticated>} />
          <Route path="/todo/:id" element={<Authenticated><TodoDetail /></Authenticated>} />
          <Route path="/profile" element={<Authenticated><Profile /></Authenticated>} />
          <Route path="/profile/edit" element={<Authenticated><ProfileEdit /></Authenticated>} />
          <Route path="/users" element={<Authenticated><Users /></Authenticated>} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
