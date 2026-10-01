import { RouterProvider } from 'react-router';
import { router } from './router.jsx';

export function App() {
  return <RouterProvider router={router} />;
}
