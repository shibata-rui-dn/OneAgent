// src/pages/Settings.jsx
import React, { useContext } from 'react';
import { AppContext } from '../AppContext';

const Settings = () => {
  const { sharedData, setSharedData } = useContext(AppContext);

  const resetData = () => {
    setSharedData({});
  };

  return (
    <div>
      <h1>Settings</h1>
      <p>共有データをリセットします。</p>
      <button onClick={resetData}>リセット</button>
      <pre>{JSON.stringify(sharedData, null, 2)}</pre>
    </div>
  );
};

export default Settings;
