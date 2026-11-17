'use client';

import { useEffect, useRef, useState } from 'react';
import liff from '@line/liff';

type InstallPlatform = 'line' | 'ios' | 'android' | 'other';

interface InstallChoice {
  outcome: 'accepted' | 'dismissed';
  platform: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function detectPlatform(): InstallPlatform {
  const userAgent = navigator.userAgent;
  if (/\bLine\/[\d.]+/i.test(userAgent)) return 'line';

  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isAppleMobile) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'other';
}

function externalInstallUrl() {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('install', '1');
  return url.href;
}

export function AuraInstallCard() {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<InstallPlatform>('other');
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const detectedPlatform = detectPlatform();
    const alreadyInstalled = isInstalledApp();
    const mountTimer = window.setTimeout(() => {
      setPlatform(detectedPlatform);
      setInstalled(alreadyInstalled);
    }, 0);

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // The install guide still works when service-worker registration is unavailable.
      });
    }

    const params = new URL(window.location.href).searchParams;
    if (!alreadyInstalled && detectedPlatform !== 'line' && params.get('install') === '1') {
      window.setTimeout(() => setShowGuide(true), 0);
      params.delete('install');
      const cleanUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', cleanUrl);
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };
    const handleInstalled = () => {
      promptRef.current = null;
      setCanPrompt(false);
      setShowGuide(false);
      setInstalled(true);
    };
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const handleDisplayMode = () => {
      if (isInstalledApp()) handleInstalled();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    displayMode.addEventListener?.('change', handleDisplayMode);
    return () => {
      window.clearTimeout(mountTimer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
      displayMode.removeEventListener?.('change', handleDisplayMode);
    };
  }, []);

  async function promptInstall() {
    const installPrompt = promptRef.current;
    if (!installPrompt || installing) return false;
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      promptRef.current = null;
      setCanPrompt(false);
      if (choice.outcome === 'accepted') setShowGuide(false);
      return choice.outcome === 'accepted';
    } finally {
      setInstalling(false);
    }
  }

  async function handleInstall() {
    if (platform === 'line') {
      const url = externalInstallUrl();
      try {
        liff.openWindow({ url, external: true });
      } catch {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) window.location.href = url;
      }
      return;
    }

    if (canPrompt && await promptInstall()) return;
    setShowGuide(true);
  }

  if (installed) return null;

  const actionLabel = platform === 'line'
    ? '在手機瀏覽器開啟並安裝'
    : canPrompt
      ? '立即安裝 App'
      : platform === 'ios'
        ? '查看 iPhone／iPad 安裝步驟'
        : '查看安裝方式';

  return (
    <>
      <section className="w-full max-w-[800px] mb-5 rounded-2xl border-2 border-[#55d6b2] bg-gradient-to-br from-[#12282a] to-[#151c2a] p-4 text-left shadow-[0_0_20px_rgba(85,214,178,0.18)]">
        <div className="flex items-start gap-3">
          <div className="text-[32px] leading-none" aria-hidden="true">📲</div>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[19px] font-bold text-[#fffdd0]">將 Aura EyeGym 加到手機主畫面</h2>
            <p className="mb-3 mt-1 text-[14px] leading-6 text-[#b7c6d9]">
              {platform === 'line'
                ? '離開 LINE 內建頁面後，依手機提示安裝；完成後會像一般 App 一樣從主畫面開啟。'
                : '安裝後可從主畫面快速開啟，並以獨立 App 畫面使用。'}
            </p>
            <button
              type="button"
              onClick={() => void handleInstall()}
              disabled={installing}
              className="w-full rounded-xl border-0 bg-[#55d6b2] px-4 py-3 text-[16px] font-bold text-[#071615] shadow-[0_5px_15px_rgba(85,214,178,0.25)] disabled:opacity-60"
            >
              {installing ? '正在開啟安裝視窗…' : actionLabel}
            </button>
          </div>
        </div>
      </section>

      {showGuide && (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/75 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
          <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-3xl border border-[#55d6b2] bg-[#111823] p-5 text-left shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="m-0 text-[13px] font-bold tracking-wider text-[#55d6b2]">安裝到手機主畫面</p>
                <h2 id="install-guide-title" className="mb-0 mt-1 text-[23px] font-bold text-[#fffdd0]">
                  {platform === 'ios' ? 'iPhone／iPad 安裝方式' : platform === 'android' ? 'Android 安裝方式' : '安裝 Aura EyeGym'}
                </h2>
              </div>
              <button type="button" onClick={() => setShowGuide(false)} aria-label="關閉安裝說明" className="h-10 w-10 shrink-0 rounded-full border border-[#415066] bg-[#1c2635] text-[22px] text-white">×</button>
            </div>

            {platform === 'ios' ? (
              <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[#d8e1ec]">
                <li className="rounded-xl bg-[#1a2432] p-4"><strong className="text-[#55d6b2]">1　使用 Safari</strong><br /><span className="text-sm">若目前不是 Safari，請先以 Safari 開啟這個頁面。</span></li>
                <li className="rounded-xl bg-[#1a2432] p-4"><strong className="text-[#55d6b2]">2　點選「分享」</strong><br /><span className="text-sm">點工具列的方框向上箭頭；若工具列隱藏，先輕點畫面。</span></li>
                <li className="rounded-xl bg-[#1a2432] p-4"><strong className="text-[#55d6b2]">3　選「加入主畫面」</strong><br /><span className="text-sm">找不到時，向下滑動分享選單，或點「編輯動作」加入。</span></li>
                <li className="rounded-xl bg-[#1a2432] p-4"><strong className="text-[#55d6b2]">4　點右上角「新增」</strong><br /><span className="text-sm">若畫面有「以 Web App 開啟」，請保持啟用；完成後回到主畫面點 Aura EyeGym 圖示。</span></li>
              </ol>
            ) : (
              <div className="space-y-3 text-[#d8e1ec]">
                {canPrompt ? (
                  <button type="button" onClick={() => void promptInstall()} disabled={installing} className="w-full rounded-xl border-0 bg-[#55d6b2] px-4 py-4 text-[17px] font-bold text-[#071615] disabled:opacity-60">
                    {installing ? '正在開啟安裝視窗…' : '立即安裝 Aura EyeGym'}
                  </button>
                ) : (
                  <>
                    <div className="rounded-xl bg-[#1a2432] p-4"><strong className="text-[#55d6b2]">1　開啟瀏覽器選單</strong><br /><span className="text-sm">Android Chrome 請點右上角「⋮」；其他瀏覽器請找選單或分享按鈕。</span></div>
                    <div className="rounded-xl bg-[#1a2432] p-4"><strong className="text-[#55d6b2]">2　選擇安裝</strong><br /><span className="text-sm">點「安裝應用程式」或「加到主畫面」，再依畫面確認。</span></div>
                    <div className="rounded-xl bg-[#1a2432] p-4"><strong className="text-[#55d6b2]">3　從主畫面開啟</strong><br /><span className="text-sm">安裝完成後，點 Aura EyeGym 圖示即可進入 App 畫面。</span></div>
                  </>
                )}
              </div>
            )}

            <p className="mb-0 mt-4 rounded-xl border border-[#33445b] bg-[#0c131d] p-3 text-[13px] leading-5 text-[#9fb0c4]">
              首次從主畫面開啟後，若尚未顯示您的帳號，請按「連結 LINE 帳號」完成一次性綁定。
            </p>
          </div>
        </div>
      )}
    </>
  );
}
