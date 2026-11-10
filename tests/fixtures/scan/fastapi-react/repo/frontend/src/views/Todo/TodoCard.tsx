export default function TodoCard({ id, title }: { id: number; title: string }) {
  return <div onClick={() => (location.href = `/todo/${id}`)}>{title}</div>;
}
