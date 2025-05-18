// src/pages/Search.jsx
import React, { useContext } from 'react';
import { AppContext } from '../AppContext';

const Search = () => {
  const { sharedData, setSharedData } = useContext(AppContext);

  const onClickItem = (item) => {
    setSharedData(prev => ({ ...prev, lastSelected: item }));
  };

  return (
    <div>
      <h1>Search</h1>
      <button onClick={() => onClickItem('foo')}>
        foo を選択
      </button>
      <p>最後に選択したのは: {sharedData.lastSelected}</p>
    </div>
  );
};

export default Search;
