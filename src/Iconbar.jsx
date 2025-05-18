// src/Iconbar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Search, Settings } from 'lucide-react';

const Iconbar = () => {
  // アクティブとインアクティブのスタイルを定義
  const baseIconStyle = "flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 backdrop-blur-sm";
  const activeIconStyle = `${baseIconStyle} bg-white/40 shadow-lg text-blue-600`;
  const inactiveIconStyle = `${baseIconStyle} bg-white/20 hover:bg-white/30 text-gray-700 hover:text-blue-500`;

  return (
    <nav
      className="fixed top-0 left-0
                 w-[50px] h-screen
                 bg-white/20 backdrop-blur-md
                 flex flex-col items-center justify-center
                 border-r border-white/20 z-20"
    >
      <div className="flex flex-col items-center justify-center h-full w-full">
        <ul className="flex flex-col items-center space-y-8 p-0 m-0">
          <li className="flex justify-center w-full">
            <NavLink to="/" end className={({ isActive }) => isActive ? activeIconStyle : inactiveIconStyle}>
              <Home size={20} />
            </NavLink>
          </li>
          <li className="flex justify-center w-full">
            <NavLink to="/search" className={({ isActive }) => isActive ? activeIconStyle : inactiveIconStyle}>
              <Search size={20} />
            </NavLink>
          </li>
          <li className="flex justify-center w-full">
            <NavLink to="/settings" className={({ isActive }) => isActive ? activeIconStyle : inactiveIconStyle}>
              <Settings size={20} />
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Iconbar;