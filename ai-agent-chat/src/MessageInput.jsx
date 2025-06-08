import React, { useState, useCallback, memo } from 'react';
import { Send, Loader } from 'lucide-react';
import { useMessageInputIsolated } from './IsolatedContexts';

const MessageInput = memo(({ onSendMessage }) => {
  const { currentPage, serverStatus } = useMessageInputIsolated();
  const [inputMessage, setInputMessage] = useState('');

  const handleSubmit = useCallback(() => {
    if (!inputMessage.trim() || currentPage?.isLoading) return;
    
    onSendMessage(inputMessage.trim());
    setInputMessage('');
  }, [inputMessage, currentPage?.isLoading, onSendMessage]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleInputChange = useCallback((e) => {
    setInputMessage(e.target.value);
  }, []);

  if (!currentPage) return null;

  return (
    <div className="bg-white border-t p-6 shadow-sm">
      <div className="flex space-x-4 max-w-full">
        <input
          type="text"
          value={inputMessage}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="メッセージを入力してください..."
          className="flex-1 p-4 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 min-w-0"
          disabled={currentPage.isLoading || serverStatus !== 'connected'}
        />

        <button
          onClick={handleSubmit}
          disabled={!inputMessage.trim() || currentPage.isLoading || serverStatus !== 'connected'}
          className="px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 disabled:transform-none"
        >
          {currentPage.isLoading ? (
            <Loader size={20} className="animate-spin" />
          ) : (
            <Send size={20} />
          )}
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // onSendMessage が変わらない限り再レンダリングしない
  return prevProps.onSendMessage === nextProps.onSendMessage;
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;