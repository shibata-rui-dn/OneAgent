// src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import './index.css';
import 'highlight.js/styles/default.css';
import 'bootstrap/dist/css/bootstrap.min.css';

import { AppProvider } from './AppContext';
import Background from './Background';
import Home from './pages/Home';
import Search from './pages/Search';
import Settings from './pages/Settings';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    {/* → Router を最上位に */}
    <BrowserRouter>
      {/* Context は Router の下でOK */}
      <AppProvider>
        <Routes>
          {/* Background の中で Iconbar や Outlet（各ページ）を描画 */}
          <Route path="/" element={<Background />}>
            <Route index element={<Home />} />
            <Route path="search" element={<Search />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
