import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Aplicativo } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><Aplicativo /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
