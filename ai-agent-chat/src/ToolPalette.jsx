import React, { memo } from 'react';
import { Palette, Wrench, CheckCircle } from 'lucide-react';
import { useToolPaletteIsolated } from './IsolatedContexts';

const ToolIcon = memo(({ toolName, className = "w-6 h-6" }) => {
  // ToolIconsは静的データなので、分離されたContextから取得する必要がありますが、
  // 今回は簡略化のため元の実装を維持
  return <Wrench className={className} />;
});

ToolIcon.displayName = 'ToolIcon';

const ToolPalette = memo(() => {
  const { 
    currentPage, 
    tools, 
    serverStatus, 
    toggleToolInPage,
    dispatch
  } = useToolPaletteIsolated();

  // 詳細デバッグログ
  console.log('ToolPalette rendering (ISOLATED)', { 
    pageId: currentPage?.id,
    toolCount: tools?.length,
    selectedCount: currentPage?.selectedTools?.size,
    selectedTools: currentPage?.selectedTools ? [...currentPage.selectedTools] : [],
    allTools: tools?.map(t => t.name) || [],
    timestamp: Date.now()
  });

  if (!currentPage) return null;

  const handleSelectAll = () => {
    console.log('Select All clicked', { 
      currentPageId: currentPage.id,
      toolNames: tools.map(t => t.name)
    });
    
    dispatch({
      type: 'UPDATE_PAGE',
      payload: {
        id: currentPage.id,
        updates: { selectedTools: new Set(tools.map(t => t.name)) }
      }
    });
  };

  const handleDeselectAll = () => {
    console.log('Deselect All clicked', { 
      currentPageId: currentPage.id
    });
    
    dispatch({
      type: 'UPDATE_PAGE',
      payload: {
        id: currentPage.id,
        updates: { selectedTools: new Set() }
      }
    });
  };

  const handleToolToggle = (toolName) => {
    console.log('Tool toggle clicked', { 
      currentPageId: currentPage.id,
      toolName,
      wasSelected: currentPage.selectedTools.has(toolName)
    });
    
    toggleToolInPage(currentPage.id, toolName);
  };

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col shadow-sm">
      <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-purple-50">
        <h3 className="font-bold text-gray-800 mb-2 flex items-center">
          <Palette className="w-5 h-5 mr-2 text-blue-600" />
          ツールパレット
        </h3>
        <div className="text-sm text-gray-600 flex items-center justify-between">
          <span>選択中: {currentPage?.selectedTools?.size || 0}/{tools.length}</span>
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-1 ${
              serverStatus === 'connected' ? 'bg-green-500' :
              serverStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
            }`}></div>
            <span className="text-xs">
              {serverStatus === 'connected' ? 'オンライン' :
                serverStatus === 'error' ? 'オフライン' : '接続中'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto">
        <div className="grid grid-cols-1 gap-2">
          {tools.map((tool) => {
            const isSelected = currentPage?.selectedTools?.has(tool.name);
            
            return (
              <button
                key={tool.name}
                onClick={() => handleToolToggle(tool.name)}
                className={`p-3 rounded-lg border-2 transition-all duration-300 flex items-center space-x-3 hover:shadow-md ${
                  isSelected
                    ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
                title={tool.description}
              >
                <div className="relative">
                  <ToolIcon toolName={tool.name} className="w-8 h-8 flex-shrink-0" />
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                      <CheckCircle size={10} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className={`text-sm font-semibold truncate ${
                    isSelected ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    {tool.name}
                  </div>
                  <div className={`text-xs mt-1 line-clamp-2 ${
                    isSelected ? 'text-blue-600' : 'text-gray-500'
                  }`}>
                    {tool.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {tools.length === 0 && (
          <div className="text-center text-gray-500 mt-8 p-6">
            <Wrench size={40} className="mx-auto mb-4 text-gray-300" />
            <p className="text-sm font-medium">ツールが見つかりません</p>
            <p className="text-xs mt-1">サーバーに接続を確認してください</p>
          </div>
        )}
      </div>

      {/* 一括操作ボタン */}
      <div className="p-3 border-t bg-gray-50">
        <div className="flex space-x-2">
          <button
            onClick={handleSelectAll}
            className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors duration-200"
          >
            すべて選択
          </button>
          <button
            onClick={handleDeselectAll}
            className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors duration-200"
          >
            すべて解除
          </button>
        </div>
      </div>
    </div>
  );
});

ToolPalette.displayName = 'ToolPalette';

export default ToolPalette;