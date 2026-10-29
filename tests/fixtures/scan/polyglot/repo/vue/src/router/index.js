import { createRouter } from 'vue-router';
export default createRouter({ routes: [
  { path: '/', component: HomeView },
  { path: '/about', component: AboutView },
  { path: '/old-about', redirect: '/about' },
] });
