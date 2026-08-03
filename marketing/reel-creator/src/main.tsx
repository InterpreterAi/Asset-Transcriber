import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// InterpreterAI Reel Builder is permanently dark — enforce dark class on root
document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(<App />);
