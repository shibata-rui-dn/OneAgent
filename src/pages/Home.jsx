import React, { useContext, useState, useRef } from 'react';
import { AppContext } from '../AppContext';

const Home = () => {
  const { sharedData } = useContext(AppContext);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef(null);

  const sendQuery = () => {
    if (!input) return;
    // ユーザーメッセージを追加
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    setInput('');
    setIsStreaming(true);

    // 前回のストリームをクローズ
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // SSE 接続を開始
    const url = `/api/agent/stream?query=${encodeURIComponent(input)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;
    let assistantMessage = '';

    es.onmessage = e => {
      const data = JSON.parse(e.data);
      // thinking はスキップ
      if (data.type === 'thinking') return;

      // 最終的なアシスタントメッセージ
      if (data.type === 'content') {
        assistantMessage += data.content;
        setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
        setIsStreaming(false);
        es.close();
      }
    };

    // ツールイベント
    es.addEventListener('tool', e => {
      const toolData = JSON.parse(e.data);
      setMessages(prev => [
        ...prev,
        { role: 'tool', content: `Tool ${toolData.name}(${JSON.stringify(toolData.params)})` }
      ]);
    });

    es.onerror = err => {
      console.error('SSE Error:', err);
      setIsStreaming(false);
      es.close();
    };
  };

  const handleSubmit = e => {
    e.preventDefault();
    sendQuery();
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Agent Chat</h1>

      <div className="border rounded p-4 h-96 overflow-y-auto mb-4 bg-white/50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={
              `mb-2 ${msg.role === 'user' ? 'text-right' : msg.role === 'assistant' ? 'text-left font-medium' : 'text-center italic text-gray-600'}`
            }
          >
            <span className="inline-block px-3 py-1 rounded-lg bg-gray-100">
              {msg.content}
            </span>
          </div>
        ))}
        {isStreaming && <div className="italic text-gray-500">…</div>}
      </div>

      <form onSubmit={handleSubmit} className="flex">
        <input
          className="flex-1 border rounded-l px-3 py-2"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="質問を入力..."
          disabled={isStreaming}
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded-r disabled:opacity-50"
          disabled={!input || isStreaming}
        >
          送信
        </button>
      </form>

      {/* 共有データの表示 */}
      <div className="mt-4">
        <p>現在の共有データ: {JSON.stringify(sharedData)}</p>
      </div>
    </div>
  );
};

export default Home;
