import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';

// リソースパスの設定
const RESOURCES_PATH = app.isPackaged
  ? join(process.resourcesPath, 'app.asar.unpacked')
  : dirname(fileURLToPath(import.meta.url));

// config.json から設定を読み込み、バックエンドのポート番号を取得
const configPath = join(RESOURCES_PATH, 'config.json');
let config = {};
try {
  const configContent = fs.readFileSync(configPath, { encoding: 'utf-8' });
  config = JSON.parse(configContent);
} catch (e) {
  console.error("Failed to load config:", e);
  config = { app_port: 6546 };
}
const backendPort = config.app_port || 6546;

let mainWindow;
let splashWindow;
let configWindow;
let backendProcess;
let backendReady = false; // /update エンドポイントが正常完了したら true
let configCompleted = false;  // 設定が正常に完了したかどうか
let minSplashTimeElapsed = false;

// スプラッシュ画面を閉じ、設定ウィンドウを表示する
function showConfigWindowIfNeeded() {
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
  if (!configCompleted && !configWindow) {
    createConfigWindow();
  }
}

// /update エンドポイントを呼び出す関数（SSEによる更新イベントを処理）
async function callUpdateEndpoint() {
  try {
    console.log("Calling update endpoint...");
    const response = await fetch(`http://localhost:${backendPort}/update`, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let accumulatedText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulatedText += decoder.decode(value, { stream: true });
      const events = accumulatedText.split("\n\n");
      for (let i = 0; i < events.length - 1; i++) {
        const eventText = events[i].trim();
        if (eventText.startsWith("data: ")) {
          const jsonStr = eventText.slice(6);
          try {
            const eventObj = JSON.parse(jsonStr);
            console.log("Update event:", eventObj);
            // 進捗イベントを設定ウィンドウへ転送
            if (configWindow && configWindow.webContents) {
              configWindow.webContents.send('update-progress', eventObj);
            }
            if (eventObj.status === "error") {
              throw new Error(eventObj.message);
            } else if (eventObj.status === "success") {
              backendReady = true;
              console.log("Update endpoint completed successfully.");
              return true;
            }
          } catch (err) {
            console.error("Error parsing event:", err);
          }
        }
      }
      accumulatedText = events[events.length - 1];
    }
    return backendReady;
  } catch (err) {
    console.error("Update endpoint error:", err);
    return false;
  }
}

function startBackendProcess() {
  return new Promise((resolve) => {
    const exePath = join(
      RESOURCES_PATH,
      'search_localFile_endpoint.dist',
      'search_localFile_endpoint.exe'
    );

    if (!fs.existsSync(exePath)) {
      console.error(`Executable not found: ${exePath}`);
      resolve(false);
      return;
    }

    backendProcess = spawn(exePath, [], { cwd: RESOURCES_PATH, detached: false });

    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend stdout: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend stderr: ${data}`);
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend exited with code ${code}`);
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend process:', err);
      resolve(false);
    });

    resolve(true);
  });
}

function stopBackendProcess() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    console.log('Backend process terminated.');
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 535,
    height: 400,
    transparent: true,
    frame: false,
    minimizable: true,
    movable: true,
    icon: join(RESOURCES_PATH, 'assets', 'icons', 'app-icon.png')
  });
  splashWindow.loadFile(join(RESOURCES_PATH, 'splash.html'));
}

function createMainWindow() {
  // デスクトップの作業領域サイズを取得
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = Math.min(Math.floor(screenWidth * 0.95), 1800);
  const windowHeight = Math.min(Math.floor(screenHeight * 0.9), 900);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    show: false, // 初期表示は非表示
    frame: false,
    icon: join(RESOURCES_PATH, 'assets', 'icons', 'app-icon.png'),
    webPreferences: {
      preload: join(RESOURCES_PATH, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(join(RESOURCES_PATH, 'build', 'index.html'));

  // mainWindow が閉じられる際、configWindow も閉じる
  mainWindow.on('close', () => {
    if (configWindow) {
      configWindow.close();
    }
  });
}

function createConfigWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = Math.min(Math.floor(screenWidth * 0.95), 1800);
  const windowHeight = Math.min(Math.floor(screenHeight * 0.9), 900);
  configWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    frame: false,
    icon: join(RESOURCES_PATH, 'assets', 'icons', 'app-icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  configWindow.loadFile(join(RESOURCES_PATH, 'config.html'));
  configWindow.on('closed', () => {
    configWindow = null;
    // 設定が完了していなければ、ユーザーが閉じたとみなしアプリ終了
    if (!configCompleted) {
      app.quit();
    }
  });
}
 
function isConfigValid(cfg) {
  return cfg.api_key && cfg.api_key.trim() !== "" &&
    cfg.end_point && cfg.end_point.trim() !== "";
}

// /config エンドポイントへ設定を送信する関数
async function updateBackendConfig() {
  const maxAttempts = 30; // 最大試行回数（必要に応じて調整してください）
  const delay = 800; // 各試行間の待機時間（ミリ秒）
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Attempt ${attempt} to update backend config...`);
      const response = await fetch(`http://localhost:${backendPort}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          end_point: config.end_point,
          api_key: config.api_key,
          app_dir: config.app_dir
        })
      });
      const result = await response.json();
      if (!response.ok) {
        console.error("Backend config update error:", result.error);
      } else {
        console.log("Backend config updated successfully:", result);
        return true;
      }
    } catch (err) {
      console.error(`Attempt ${attempt} failed:`, err);
    }
    if (attempt < maxAttempts) {
      // 指定時間待機してから次の試行へ
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}


function setupIPC() {
  ipcMain.on('window:minimize', (event, target) => {
    if (target === 'main') {
      mainWindow?.minimize();
    } else if (target === 'splash') {
      splashWindow?.minimize();
    }
  });
  ipcMain.on('window:maximize', (event, target) => {
    if (target === 'main') {
      mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    } else if (target === 'splash') {
      splashWindow?.isMaximized() ? splashWindow.unmaximize() : splashWindow.maximize();
    }
  });
  ipcMain.on('window:close', (event, target) => {
    if (target === 'main') {
      mainWindow?.close();
    } else if (target === 'splash') {
      splashWindow?.close();
    }
  });
  ipcMain.on('window:move', (event, { target, deltaX, deltaY }) => {
    let win;
    if (target === 'main') {
      win = mainWindow;
    } else if (target === 'splash') {
      win = splashWindow;
    }
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + deltaX, y + deltaY);
  });
  ipcMain.handle('get-config', async () => {
    return config;
  });

  // submit-config ハンドラー（設定送信成功時は configCompleted を true にし、config ウィンドウを閉じ main ウィンドウを表示）
  // submit-config ハンドラー内
  ipcMain.handle('submit-config', async (event, newConfig) => {
    config = { ...config, ...newConfig };
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err) {
      console.error("Failed to save config:", err);
      return { success: false, error: "設定の保存に失敗しました: " + err.message };
    }
    if (!isConfigValid(config)) {
      return { success: false, error: "指定したパスが存在しない、もしくは空です。" };
    }
    const updateSuccess = await updateBackendConfig();
    if (!updateSuccess) {
      return { success: false, error: "Backend config update failed" };
    }

    // バックエンドの更新エンドポイントの確認をリトライする処理
    let updateEndpointSuccess = false;
    const maxAttempts = 30;    // 最大試行回数（必要に応じて調整してください）
    const delay = 500;       // 各試行間の待ち時間（ミリ秒）
    for (let i = 0; i < maxAttempts; i++) {
      updateEndpointSuccess = await callUpdateEndpoint();
      if (updateEndpointSuccess) break;
      // 失敗している場合は待機（この間、エラーメッセージは表示しない）
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (!updateEndpointSuccess) {
      return { success: false, error: "Update endpoint failed even after config update." };
    }

    // 設定が正常に完了したことをマークし、configWindow を閉じ、mainWindow を表示する
    configCompleted = true;
    if (configWindow) {
      configWindow.close();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    return { success: true };
  });


  // 「参照」ボタン用：ファイル・ディレクトリ選択ダイアログを表示
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // configウィンドウの「キャンセル」または「閉じる」ボタンが押された場合、全プロセス終了
  ipcMain.on('config:cancel', () => {
    app.quit();
  });
  ipcMain.on('config:close', () => {
    app.quit();
  });
}

function handleAppReady() {
  // mainWindow は非表示で作成するので、読み込み完了を待つだけ
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('Main window finished load');
  });

  // 最低 1.8 秒（1800ms）表示させる
  setTimeout(() => {
    console.log('Minimum splash time elapsed');
    minSplashTimeElapsed = true;
    // スプラッシュ表示中は config ウィンドウを表示しないため、ここで直ちにスプラッシュを閉じ、設定ウィンドウを開く
    showConfigWindowIfNeeded();
  }, 1800);
}

app.whenReady().then(async () => {
  console.time('appStartup');

  // まず、スプラッシュ画面を即表示
  createSplashWindow();

  const backendStarted = await startBackendProcess();
  if (!backendStarted) {
    console.error("Backend process failed to start. Exiting.");
    app.quit();
    return;
  }

  // MainWindow を作成（表示は設定完了後）
  createMainWindow();
  setupIPC();
  handleAppReady();

  console.timeEnd('appStartup');
});

app.on('window-all-closed', () => {
  stopBackendProcess();
  if (configWindow) {
    configWindow.destroy();
  }
  app.quit();
});

app.on('before-quit', () => {
  stopBackendProcess();
  if (configWindow) {
    configWindow.destroy();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

process.on('exit', () => {
  stopBackendProcess();
});

process.on('SIGINT', () => {
  stopBackendProcess();
  process.exit();
});

process.on('SIGTERM', () => {
  stopBackendProcess();
  process.exit();
});
