import React from 'react';
import { Outlet } from 'react-router-dom';
import Iconbar from './Iconbar';

const GlassRainbowBackground = () => {
  // 静的な泡の配置
  const bubbles = [
    { id: 'b1', x: 15, y: 20, size: 5, opacity: 0.2 },
    { id: 'b2', x: 35, y: 45, size: 7, opacity: 0.15 },
    { id: 'b3', x: 60, y: 25, size: 4, opacity: 0.25 },
    { id: 'b4', x: 80, y: 65, size: 6, opacity: 0.18 },
    { id: 'b5', x: 20, y: 70, size: 8, opacity: 0.12 },
    { id: 'b6', x: 85, y: 15, size: 3, opacity: 0.3 },
    { id: 'b7', x: 45, y: 85, size: 5, opacity: 0.22 },
    { id: 'b8', x: 65, y: 40, size: 4, opacity: 0.28 },
    { id: 'b9', x: 30, y: 60, size: 6, opacity: 0.15 },
    { id: 'b10', x: 75, y: 80, size: 7, opacity: 0.2 },
    { id: 'b11', x: 10, y: 35, size: 4, opacity: 0.25 },
    { id: 'b12', x: 50, y: 30, size: 3, opacity: 0.3 },
    { id: 'b13', x: 70, y: 10, size: 5, opacity: 0.18 },
    { id: 'b14', x: 25, y: 90, size: 4, opacity: 0.22 },
    { id: 'b15', x: 90, y: 55, size: 6, opacity: 0.15 },
  ];
  
  return (
    <div className="relative h-screen w-full overflow-hidden bg-white">
      {/* 静的なグラデーションレイヤー */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          background: `radial-gradient(
            circle at 50% 50%, 
            rgba(255, 200, 255, 0.8) 0%, 
            rgba(200, 200, 255, 0.6) 25%, 
            rgba(200, 255, 255, 0.5) 50%, 
            rgba(200, 255, 200, 0.4) 75%, 
            rgba(255, 255, 200, 0.3) 100%
          )`
        }}
      />
      
      {/* 虹色のプリズム効果 - 静的 */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `linear-gradient(
            45deg,
            rgba(255, 0, 0, 0.1),
            rgba(255, 165, 0, 0.1),
            rgba(255, 255, 0, 0.1),
            rgba(0, 128, 0, 0.1),
            rgba(0, 0, 255, 0.1),
            rgba(75, 0, 130, 0.1),
            rgba(238, 130, 238, 0.1)
          )`,
          backgroundSize: '400% 400%'
        }}
      />
      
      {/* ガラス効果のレイヤー */}
      <div className="absolute inset-0 backdrop-blur-sm" />
      
      {/* 泡の効果 */}
      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${bubble.x}%`,
            top: `${bubble.y}%`,
            width: `${bubble.size}rem`,
            height: `${bubble.size}rem`,
            opacity: bubble.opacity,
            filter: 'blur(8px)',
            boxShadow: '0 0 10px rgba(255, 255, 255, 0.8), 0 0 20px rgba(255, 255, 255, 0.4)'
          }}
        />
      ))}
      
      <Iconbar />
      <main className="ml-[50px] w-[calc(100vw-50px)] h-screen bg-transparent overflow-auto relative z-10">
        <Outlet />
      </main>
      
      {/* スタイルを削除（アニメーションなし） */}
    </div>
  );
};

export default GlassRainbowBackground;

