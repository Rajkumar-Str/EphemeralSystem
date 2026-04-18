import React from 'react';
import ReactDOM from 'react-dom/client';
import Page from './app/page';
import './app/globals.css';
import 'katex/dist/katex.min.css';
import '@fontsource/stix-two-text';
import '@fontsource/noto-sans-math';
import '@fontsource/noto-sans-symbols-2';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>,
);
