import { createContext } from 'react';
import axios from '../services/axios';
import { isValidToken } from '../utils/jwt';
import { setSession } from '../utils/session';

export const AuthContext = createContext({ isAuthenticated: false, user: null as string | null });
export const login = async (u: string, p: string) => setSession((await axios.post('/login', { u, p })).data.token, isValidToken);
