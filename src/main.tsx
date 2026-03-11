import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './lib/api-interceptor'; // Import mock backend before anything else
import { initDriveSync } from './lib/drive-sync';
import App from './App.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);

// Render a loading state initially
root.render(
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-slate-600 font-medium">Loading library...</p>
    </div>
  </div>
);

// Initialize Google Drive Sync, then render the app
initDriveSync()
  .catch(console.error)
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
