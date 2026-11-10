import { useContext } from 'react';
import { AuthContext } from '../context/JWTAuthContext';

export default function useAuth() {
  return useContext(AuthContext);
}
