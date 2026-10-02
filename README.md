# 存錢罐

給小朋友用的電子存錢罐。家長發零用錢，錢會掉到盤子上，小朋友自己一枚一枚投進罐子。投硬幣、放鈔票都有動畫和聲音，罐子裡的錢會真的堆起來，數量和金額一致。

- 四個用途：買零食、買車車、存起來、緊急用，每個用途一個罐子，左右滑動切換
- 罐子樣式：小豬撲滿（紅、黃、藍、綠、粉紅）、玻璃罐（愛心、星星、太陽）、車車／火車／高鐵
- 罐子滿了可以換新罐子，換的時候可以選樣式，舊罐子會排到架子上
- 可以有好幾個小朋友，各自存各自的
- 家長畫面：按住右下角齒輪約 1 秒打開。可以發零用錢、設定分配比例、看存了多少
- 畫面風格是兒童蠟筆畫，標題附注音

## 在電腦上試用

```bash
cd 存錢罐
python3 -m http.server 8765
```

打開 http://localhost:8765/

手機要跟電腦連同一個 Wi-Fi，用 Safari 打開 `http://電腦的IP:8765/`。

## 放到網路上（GitHub Pages）

1. 把這個資料夾上傳到 GitHub（public repo）
2. Repo 的 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/ (root)`
3. 大約一分鐘後，網址會是 `https://你的帳號.github.io/repo名稱/`
4. 用 iPhone Safari 打開，按分享 →「加入主畫面」，就會像 App 一樣全螢幕，而且離線也能打開

## 資料存在哪裡

目前所有資料都存在**手機瀏覽器裡**（localStorage），不會上傳到任何地方。所以：

- 換手機、或刪掉主畫面上的 App，資料就會不見
- 同一個人用兩支手機，資料不會同步

之後要做備份或同步，再接 Firebase 或 Mac mini（只要改 `js/store.js` 的 `load` / `save`）。

## 檔案

| 檔案 | 內容 |
|---|---|
| `index.html` | 主畫面 |
| `css/app.css` | 樣式 |
| `js/main.js` | 主畫面：滑動、盤子、投幣、換新罐子、切換小朋友 |
| `js/art.js` | 蠟筆繪圖：罐子、錢幣、盤子、背景 |
| `js/physics.js` | 物理堆疊（Matter.js） |
| `js/sound.js` | 音效（Web Audio 即時合成，沒有音檔） |
| `js/store.js` | 資料結構和存檔 |
| `js/allocate.js` | 分配比例 |
| `js/parent.js` | 家長畫面 |
| `js/icons.js` | 圖示、小朋友頭像 |
| `sw.js` | 離線快取 |
| `prototypes/` | 第一輪三種風格的比較稿 |
| `PLAN.md` | 工作規劃 |
