// src/AppContext.jsx
import React, { createContext, useState } from 'react';

export const AppContext = createContext({
  sharedData: null,
  setSharedData: () => {}
});

export const AppProvider = ({ children }) => {
  const [sharedData, setSharedData] = useState({ /* 初期値 */ });

  return (
    <AppContext.Provider value={{ sharedData, setSharedData }}>
      {children}
    </AppContext.Provider>
  );
};
