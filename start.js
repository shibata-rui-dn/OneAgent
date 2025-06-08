import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// サーバ設定
const servers = [
  {
    name: 'Main Server',
    cwd: process.cwd(),
    command: 'node',
    args: ['server.js']
  },
  {
    name: 'AI Agent Chat',
    cwd: path.join(process.cwd(), 'ai-agent-chat'),
    command: 'npm',
    args: ['run', 'dev']
  },
  {
    name: 'FastEX Demo',
    cwd: path.join(process.cwd(), 'demo', 'FastEX'),
    command: 'node',
    args: ['server.js']
  },
  {
    name: 'LocalDrive Demo',
    cwd: path.join(process.cwd(), 'demo', 'LocalDrive'),
    command: 'npm',
    args: ['run', 'dev']
  },
  {
    name: 'FastCRM Demo',
    cwd: path.join(process.cwd(), 'demo', 'FastCRM'),
    command: 'node',
    args: ['server.js']
  }
];

// カラー出力用
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const serverColors = [colors.blue, colors.green, colors.yellow, colors.magenta, colors.cyan];

// ログ出力関数
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// node_modulesの存在確認
function checkNodeModules(directory) {
  const nodeModulesPath = path.join(directory, 'node_modules');
  return fs.existsSync(nodeModulesPath);
}

// npm installの実行
function runNpmInstall(directory) {
  return new Promise((resolve, reject) => {
    log(`📦 npm install を実行中: ${directory}`, colors.yellow);
    
    const npmInstall = spawn('npm', ['install'], {
      cwd: directory,
      stdio: 'pipe',
      shell: process.platform === 'win32'
    });

    npmInstall.stdout.on('data', (data) => {
      log(`[npm install] ${data.toString().trim()}`, colors.yellow);
    });

    npmInstall.stderr.on('data', (data) => {
      log(`[npm install] ${data.toString().trim()}`, colors.yellow);
    });

    npmInstall.on('close', (code) => {
      if (code === 0) {
        log(`✅ npm install 完了: ${directory}`, colors.green);
        resolve();
      } else {
        log(`❌ npm install 失敗: ${directory} (終了コード: ${code})`, colors.red);
        reject(new Error(`npm install failed with code ${code}`));
      }
    });
  });
}

// サーバ起動関数
function startServer(serverConfig, index) {
  return new Promise(async (resolve, reject) => {
    const { name, cwd, command, args } = serverConfig;
    const color = serverColors[index % serverColors.length];

    try {
      // ディレクトリの存在確認
      if (!fs.existsSync(cwd)) {
        log(`❌ ディレクトリが見つかりません: ${cwd}`, colors.red);
        reject(new Error(`Directory not found: ${cwd}`));
        return;
      }

      // package.jsonの存在確認
      const packageJsonPath = path.join(cwd, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        // node_modulesの確認とnpm install
        if (!checkNodeModules(cwd)) {
          log(`🔍 node_modules が見つかりません。npm install を実行します: ${cwd}`, colors.yellow);
          await runNpmInstall(cwd);
        } else {
          log(`✅ node_modules 確認済み: ${cwd}`, colors.green);
        }
      }

      // サーバ起動
      log(`🚀 起動中: ${name}`, color);
      
      const server = spawn(command, args, {
        cwd,
        stdio: 'pipe',
        shell: process.platform === 'win32'
      });

      // 出力の処理
      server.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          log(`[${name}] ${output}`, color);
        }
      });

      server.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          log(`[${name}] ${output}`, color);
        }
      });

      server.on('close', (code, signal) => {
        if (signal) {
          log(`⏹️  ${name} がシグナルにより終了しました (シグナル: ${signal})`, color);
        } else if (code === 0) {
          log(`✅ ${name} が正常終了しました`, color);
        } else if (code === null) {
          log(`⏹️  ${name} が強制終了されました`, color);
        } else {
          log(`❌ ${name} が異常終了しました (終了コード: ${code})`, colors.red);
        }
      });

      server.on('error', (error) => {
        log(`❌ ${name} でエラーが発生しました: ${error.message}`, colors.red);
        reject(error);
      });

      // サーバが起動したとみなす（実際の起動確認はログで行う）
      setTimeout(() => {
        log(`✅ ${name} の起動処理完了`, color);
        resolve(server);
      }, 2000);

    } catch (error) {
      log(`❌ ${name} の起動に失敗しました: ${error.message}`, colors.red);
      reject(error);
    }
  });
}

// メイン実行関数
async function main() {
  log('🎯 マルチサーバ起動スクリプト開始', colors.cyan);
  log('='.repeat(50), colors.cyan);

  const runningServers = [];

  try {
    // 各サーバを順次起動
    for (let i = 0; i < servers.length; i++) {
      const server = await startServer(servers[i], i);
      runningServers.push(server);
      
      // 次のサーバ起動前に少し待機
      if (i < servers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    log('='.repeat(50), colors.green);
    log('🎉 すべてのサーバが起動しました！', colors.green);
    log('📝 各サーバのログは上記で確認できます', colors.green);
    log('⏹️  Ctrl+C で全サーバを停止します', colors.yellow);

  } catch (error) {
    log(`❌ サーバ起動中にエラーが発生しました: ${error.message}`, colors.red);
    
    // 起動済みのサーバを停止
    log('🛑 起動済みサーバを停止中...', colors.yellow);
    runningServers.forEach(server => {
      if (server && !server.killed) {
        server.kill();
      }
    });
    
    process.exit(1);
  }

  // Ctrl+C での終了処理
  process.on('SIGINT', () => {
    log('\n🛑 終了シグナルを受信しました。サーバを停止中...', colors.yellow);
    
    runningServers.forEach((server, index) => {
      if (server && !server.killed) {
        log(`⏹️  ${servers[index].name} を停止中...`, colors.yellow);
        // 優雅な終了を試みる
        server.kill('SIGTERM');
        
        // 3秒後に強制終了
        setTimeout(() => {
          if (!server.killed) {
            log(`🔨 ${servers[index].name} を強制終了中...`, colors.red);
            server.kill('SIGKILL');
          }
        }, 3000);
      }
    });
    
    setTimeout(() => {
      log('👋 すべてのサーバが停止しました', colors.green);
      process.exit(0);
    }, 4000);
  });
}

// スクリプト実行
main().catch(error => {
  log(`❌ 致命的エラー: ${error.message}`, colors.red);
  process.exit(1);
});