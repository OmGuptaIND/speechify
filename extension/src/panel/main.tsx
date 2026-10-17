import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../lib/companion';
if (new URLSearchParams(location.search).get('mode') === 'page')
  document.documentElement.classList.add('page-rail-document');
createRoot(document.getElementById('root')!).render(<App />);
