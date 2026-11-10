import Sidebar from './Sidebar';

export default function Layout({ children }: { children: JSX.Element }) {
  return <div><Sidebar />{children}</div>;
}
