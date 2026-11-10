import axios from 'axios';
import { getToken } from '../utils/session';

const instance = axios.create({ baseURL: '/api/v1' });
instance.interceptors.request.use((c) => ({ ...c, headers: { ...c.headers, Authorization: `Bearer ${getToken()}` } }));
export default instance;
