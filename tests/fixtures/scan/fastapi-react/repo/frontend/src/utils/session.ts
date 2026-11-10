export const getToken = () => localStorage.getItem('token');
export const setSession = (t: string, check: (t: string) => boolean) => check(t) && localStorage.setItem('token', t);
