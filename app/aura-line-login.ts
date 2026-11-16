'use client';

import { useEffect, useState } from 'react';
import liff from '@line/liff';

type Profile = { uid: string; name: string };
type DesktopLink = { proof: string; challenge: string; startedAt: number };

const signedOut = { uid: '未登入', name: '' };
const sessionPath = '/api/aura-line-session';
const linkParam = 'auraDesktopLink';
const challengeFormat = /^[A-Za-z0-9_-]{43}$/;
const desktopLinkKey = 'aura:pendingDesktopLogin';
const linkLifetime = 5 * 60 * 1000;
let liffInitialization: Promise<void> | undefined;

function getLiffReady() {
  if (!liffInitialization) {
    liffInitialization = liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID || '' }).catch(error => {
      liffInitialization = undefined;
      throw error;
    });
  }
  return liffInitialization;
}

function sessionRequest(body?: object) {
  return fetch(sessionPath, {
    cache: 'no-store',
    ...(body ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : {}),
  });
}

function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loginUrl(challenge: string) {
  const url = new URL('/', window.location.origin);
  url.searchParams.set(linkParam, challenge);
  return url.href;
}

function restoreDesktopLink() {
  try {
    const raw = window.localStorage.getItem(desktopLinkKey);
    if (!raw) return null;
    const link = JSON.parse(raw) as DesktopLink;
    if (challengeFormat.test(link.proof) && challengeFormat.test(link.challenge) &&
        Date.now() - link.startedAt < linkLifetime) return link;
    window.localStorage.removeItem(desktopLinkKey);
  } catch {
    // A link will still work while the installed app stays open.
  }
  return null;
}

function saveDesktopLink(link: DesktopLink | null) {
  try {
    if (link) window.localStorage.setItem(desktopLinkKey, JSON.stringify(link));
    else window.localStorage.removeItem(desktopLinkKey);
  } catch {
    // This storage is only needed to resume a link after the app is closed.
  }
}

export function useAuraLineLogin() {
  const [profile, setProfile] = useState<Profile>(signedOut);
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [link, setLink] = useState<DesktopLink | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const homeScreen = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const browserChallenge = new URL(window.location.href).searchParams.get(linkParam) ?? '';

    setStandalone(homeScreen);
    if (!homeScreen && challengeFormat.test(browserChallenge)) setChallenge(browserChallenge);

    async function initialize() {
      let saved: Profile | null = null;
      try {
        const response = await sessionRequest();
        if (response.ok) {
          const data = await response.json() as { profile: Profile | null };
          saved = data.profile;
          if (saved && active) setProfile(saved);
        }
      } catch {
        // Normal browser login can still work when the session API is unavailable.
      }

      if (homeScreen) {
        if (active) {
          if (saved) saveDesktopLink(null);
          else setLink(restoreDesktopLink());
          setReady(true);
        }
        return;
      }

      try {
        await getLiffReady();
        const token = liff.getAccessToken();
        if (!active || !liff.isLoggedIn() || !token) return;

        if (!saved || challengeFormat.test(browserChallenge)) {
          try {
            const response = await sessionRequest({ action: 'login', token });
            if (response.ok) {
              const data = await response.json() as { profile: Profile };
              if (active) setProfile(data.profile);
              return;
            }
          } catch {
            // Keep the existing LIFF browser experience available.
          }
          if (saved) return;
          const result = await liff.getProfile();
          if (active) setProfile({ uid: result.userId, name: result.displayName });
        }
      } catch {
        if (active && !saved) setMessage('LINE 認證暫時無法連線。');
      } finally {
        if (active) setReady(true);
      }
    }

    void initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!link) return;
    const pending = link;
    let active = true;
    let timer: number | undefined;
    let checking = false;
    let nextCheck = 0;
    function schedule() {
      if (active) timer = window.setTimeout(check, 2500);
    }
    async function check() {
      if (!active || checking || Date.now() < nextCheck) return;
      if (Date.now() - pending.startedAt >= linkLifetime) {
        saveDesktopLink(null);
        setLink(null);
        setMessage('這次連結已逾時，請重新產生識別碼。');
        return;
      }
      if (document.visibilityState !== 'visible') {
        schedule();
        return;
      }
      checking = true;
      try {
        const response = await sessionRequest({ action: 'claim', proof: pending.proof });
        if (!active) return;
        if (response.status === 200) {
          const data = await response.json() as { profile: Profile };
          if (!active) return;
          setProfile(data.profile);
          saveDesktopLink(null);
          setLink(null);
          setMessage('');
          return;
        }
        if (response.status === 503) {
          setMessage('登入服務暫時無法連線，請稍後回到主畫面 App。');
        }
      } catch {
        if (active) setMessage('等待登入確認中。網路恢復後會自動重試。');
      } finally {
        checking = false;
      }
      nextCheck = Date.now() + 1000;
      schedule();
    }
    function resume() {
      window.clearTimeout(timer);
      nextCheck = 0;
      void check();
    }
    timer = window.setTimeout(check, 1500);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
    };
  }, [link]);

  async function beginDesktopLink() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const created = {
        proof: encode(bytes),
        challenge: encode(new Uint8Array(digest)),
        startedAt: Date.now(),
      };
      saveDesktopLink(created);
      setLink(created);
    } catch {
      setMessage('目前無法建立登入連結，請重開 App 後再試。');
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await getLiffReady();
      if (!liff.isLoggedIn() && !liff.isInClient()) {
        liff.login({ redirectUri: challenge ? loginUrl(challenge) : new URL('/', window.location.origin).href });
        return;
      }
      const token = liff.getAccessToken();
      if (!token) throw new Error('LINE access token unavailable');
      const response = await sessionRequest({ action: 'login', token });
      if (response.ok) {
        const data = await response.json() as { profile: Profile };
        setProfile(data.profile);
        return;
      }
      const result = await liff.getProfile();
      setProfile({ uid: result.userId, name: result.displayName });
    } catch {
      setMessage('登入尚未完成，請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  async function approveDesktopLink() {
    if (!challenge || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const token = liffInitialization && liff.isLoggedIn() ? liff.getAccessToken() : null;
      const response = await sessionRequest({ action: 'approve', challenge, token, expectedUid: profile.uid });
      if (response.ok) {
        setApproved(true);
        window.history.replaceState(window.history.state, '', '/');
      } else {
        setMessage('無法完成連結。請確認已登入欲使用的 LINE 帳號後再試。');
      }
    } catch {
      setMessage('無法完成連結，請確認網路後再試。');
    } finally {
      setBusy(false);
    }
  }

  return {
    profile, ready, standalone, busy, message, approved,
    code: (link?.challenge ?? challenge).slice(0, 8),
    desktopLinkUrl: link ? loginUrl(link.challenge) : '',
    browserLink: Boolean(challenge),
    beginDesktopLink, login, approveDesktopLink,
  };
}
