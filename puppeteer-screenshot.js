/**
 * render-cards.js
 * 1) server.js の ./getAllCard へリクエストし、全カードデータを取得
 * 2) Puppeteer でカードページを開いてスクリーンショットを撮り、{id}.pngを保存
 *
 * 使い方:
 *   node render-cards.js
 */

const puppeteer = require("puppeteer");
const fetch = require("node-fetch"); // Node.js v18-では不要(標準搭載)

const fs = require("fs");
const path = require("path");

async function main() {
  try {
    // 1) ./getAllCard からカードデータを取得
    const allCardData = await fetch("http://localhost:3000/getAllCard").then((res) => res.json());

    console.log("取得したカード数:", allCardData.length);

    // 2) puppeteer を起動
    const browser = await puppeteer.launch({
      headless: "new", // Puppeteer v20 以降なら "new" が推奨
      // headless: true, // v19 以下の場合はこちら
    });

    // 3) カードを1枚ずつ描画してスクリーンショットを撮る
    for (const card of allCardData) {
      const cardId = card.id;

      console.log(`=== カードID: ${cardId} のスクリーンショット生成中... ===`);

      const page = await browser.newPage();

      // 3-1) カード描画用のフロントエンドURLを開く
      //      - 下記URLは例。あなたのReactアプリやコンポーネントのURLに合わせてください
      //      - クエリパラメータ等で cardId を渡し、対応するカードを表示する想定
      const targetUrl = `http://localhost:3001/?cardId=${cardId}`;
      // もし server.js と同じサーバーでReactアプリが動いていればポートが同じになるかもしれません。
      // 適宜URLを修正してください。
      await page.goto(targetUrl, { waitUntil: "networkidle2" });

      // 3-2) カードがレンダリングされるまで待つ
      //      - 例として #captureArea が表示されるのを待つなど
      //      - ここでは3秒スリープで雑に待機
      await page.waitForTimeout(3000);

      // 3-3) スクリーンショットを撮って保存
      const outputDir = path.join(__dirname, "public", "images");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const imagePath = path.join(outputDir, `${cardId}.png`);

      // 全画面キャプチャ あるいは 特定要素のみキャプチャしたい場合は下記を拡張
      await page.screenshot({ path: imagePath, fullPage: false });

      console.log(` --> 画像ファイル生成: ${imagePath}`);

      await page.close();
    }

    await browser.close();
    console.log("=== すべてのカード画像生成が完了しました ===");
  } catch (err) {
    console.error("エラー:", err);
  }
}

main();
