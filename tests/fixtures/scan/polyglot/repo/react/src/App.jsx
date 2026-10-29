import { Routes, Route, Link, useNavigate } from 'react-router-dom';
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />}>
          <Route path=":projectId" element={<ProjectPage />} />
        </Route>
        <Route path={"/settings"} element={<Settings />} />
      </Route>
    </Routes>
  );
}
