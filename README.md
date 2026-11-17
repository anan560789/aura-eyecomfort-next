This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Aura EyeGym 桌面 App 登入

部署使用既有的 Cloudflare Pages 建置指令 `npx @cloudflare/next-on-pages@1`，輸出目錄仍為 `.vercel/output/static`。在 Pages 專案的執行環境設定確認有啟用相容性旗標 `nodejs_compat`。

1. 在 Cloudflare 建立供 Aura EyeGym 使用的 D1 資料庫（例如 `aura-pwa-links`），在其 Console 執行 [建立桌面 App 連結表的 SQL](migrations/aura-pwa-links.sql)。
2. 在 Pages 專案的 **Settings → Bindings** 將該 D1 資料庫連結為 `AURA_PWA_LINKS`。
3. 在 **Settings → Variables and Secrets** 設定 `AURA_LINE_CHANNEL_ID` 為 Aura EyeGym 的 LINE Login 頻道 ID。這是 LINE Developers 主設定顯示的純數字 Channel ID。新增加密變數 `AURA_SESSION_SECRET`，使用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` 產生新的 43 字元值，直接貼到 Cloudflare。
4. 在要測試的環境設好以上三項後部署。預覽和正式環境分開設定，預覽用的網址若不在 LIFF Endpoint URL 範圍內，只適合驗證 API 和介面。正式 LINE 登入以原本的 LINE 入口驗證。
5. 已安裝的 iPhone App 可在原圖示內按「連結 LINE 帳號」，按「開啟 LINE 登入頁」並核對畫面上的識別碼。完成確認後回到原本的圖示即可。新安裝時可先在 Safari 登入 Aura EyeGym，再「加入主畫面」。桌面 App 的登入憑證有效七天。

### 既有訓練紀錄的建置變數

在 Cloudflare Pages 專案的 **Settings → Variables and Secrets**，確認目標環境（Preview 或 Production）有以下建置變數。使用本機 `.env.local` 建置時，也需設定同名變數。

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 使用同一個 Aura EyeGym Supabase 專案的前端 anon／publishable key。
- `NEXT_PUBLIC_AURA_SIGNATURE_SALT` 使用既有訓練紀錄雜湊的相容值，須與 `app/clinic/page.tsx` 目前使用的值相同，才能核對既有訓練紀錄與補送離線資料。這是供前端相容用的值，會出現在瀏覽器程式中。登入 Session 另使用僅供伺服器讀取的 `AURA_SESSION_SECRET`。
