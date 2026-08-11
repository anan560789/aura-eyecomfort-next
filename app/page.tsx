'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import liff from '@line/liff';
import { createClient } from '@supabase/supabase-js';
// @ts-ignore (忽略 TypeScript 對 nosleep 的型別警告)
import NoSleep from 'nosleep.js';

// ==========================================
// 1. 全域設定與 Supabase 初始化
// ==========================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bowzkrdxjfxwuxkvvlnh.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_JyPNp0UKUlSeNKMM-okN4Q_TAHuCSMT';
const supabase = createClient(supabaseUrl, supabaseKey);

const maxCycles = 3;
const focusDepths = [-1, -15, -35, -60];
const focusColors = [0xff3366, 0xff4d79, 0xff668c, 0xff809f];
const focusTexts = [
  "<div style='color:#FF3366;'>【極近對焦】</div>用力看清缺口方向",
  "<div style='color:#ff4d79;'>【中近距離】</div>尋找缺口位置",
  "<div style='color:#ff668c;'>【中遠距離】</div>嘗試辨識缺口",
  "<div style='color:#ff809f;'>【深空極限】</div>盡力即可，請放鬆不勉強"
];

// 醫學原理資料庫
const medicalPrinciples: Record<string, any> = {
  sop: { icon: "🚀", title: "45秒快速舒緩", color: "#FF6B6B", principle: "此模組結合了「睫狀肌放鬆」、「動態視覺刺激」與「淚膜重建」。<br><br>透過注視遠近變化的球體，能迅速解除水晶體對焦痙攣；最後的強制用力閉眼，則能擠壓眼瞼板腺均勻分泌油脂。" },
  stretch: { icon: "🔄", title: "動態 3D 眼肌伸展", color: "#4D96FF", principle: "現代人長時間死盯著手機，導致控制眼球的「眼外肌」僵硬缺血。<br><br>本模組利用最大範圍的 ∞ 字型（無限大）極限軌跡，強迫拉伸控制眼球的六條眼外肌，促進眼周血液循環。" },
  chaser: { icon: "🎮", title: "睫狀肌深空追光", color: "#6BCB77", principle: "利用 3D 透視原理創造出「無限遠（Optical Infinity）」的視覺錯覺。藉由死盯流星飛向最深處，能強迫睫狀肌徹底放鬆、拉長，解除深層視覺疲勞。" },
  breathe: { icon: "🌌", title: "星雲散焦與神經放鬆", color: "#FFD93D", principle: "引導您「放寬視野、不要對焦任何單顆星星」，啟動周邊視覺（Peripheral Vision），配合深度共振呼吸法，喚醒副交感神經，達到神經級的深度重置。" },
  focus: { icon: "🎯", title: "Z 軸遠近對焦飛梭", color: "#FF3366", principle: "這是一款「睫狀肌的幫浦重訓」。利用 Three.js 的 Z 軸深度與強烈透視，強迫睫狀肌進行極端收縮（看近）與極端放鬆（看遠）的快速切換，藉此恢復水晶體的對焦彈性。<br><br><strong style='color:#00ffcc;'>⏱️ 訓練時間：單眼各 60 秒，共需 2 分鐘。</strong><br><br><strong style='color:#FF3366;'>⚠️ 這是重新訓練眼睛聚焦能力模組，屬於較高強度的眼肌運動，如有不適請立即停止並讓眼睛休息。</strong>" }
};

export default function EyeComfortApp() {
  // ==========================================
  // 2. React UI 狀態管理
  // ==========================================
  const [currentView, setCurrentView] = useState<'DASHBOARD' | 'CALENDAR' | 'INFO_NUTRIENT' | 'INFO_RPE' | 'INFO_INTRO' | 'AD' | 'TRAINING'>('DASHBOARD');
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [lineProfile, setLineProfile] = useState({ uid: '未登入', name: '' });
  const [uiState, setUiState] = useState<{ title: string | React.ReactNode, timer: string, top: string, showContinue: boolean }>({ title: '', timer: '', top: '70%', showContinue: false });
  const [calendarData, setCalendarData] = useState<{ todayCycles: number, monthCycles: number, days: number[], today: number, year: number, month: number }>({ todayCycles: 0, monthCycles: 0, days: [], today: 1, year: 2026, month: 1 });

  // ==========================================
  // 3. 遊戲核心狀態
  // ==========================================
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<any>(null); 
  const audioRef = useRef<any>({ ctx: null, bgm: null, fadeInt: null, dipTimeout: null });
  const noSleepRef = useRef<any>(null); // 使用 NoSleep.js
  
  const gameState = useRef({
    module: 'DASHBOARD',
    cycle: 1, phase: 'LOOKING', sopTimeLeft: 10,
    stretchTimeLeft: 45,
    chaserTimeLeft: 60, chaserScore: 0,
    breatheTimeLeft: 60, breathPhase: 'INHALE',
    focusTimeLeft: 120, focusStep: 0, focusDirection: 1, focusHoldTime: 3, focusCycleSpeed: 3, isWaitingForRightEye: false,
    testPhase: 'LEFT_EYE', testTimeLeft: 15,
    isResting: false, restTimeLeft: 0
  });

  // ==========================================
  // 4. 螢幕常亮控制 (NoSleep.js)
  // ==========================================
  useEffect(() => {
    // 只有在客戶端才實例化 NoSleep
    noSleepRef.current = new NoSleep();
    return () => {
      if (noSleepRef.current) noSleepRef.current.disable();
    };
  }, []);

  // ==========================================
  // 5. 音效與 BGM 系統
  // ==========================================
  useEffect(() => {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    audioRef.current.ctx = new AudioContext();
    audioRef.current.bgm = new Audio();
    audioRef.current.bgm.loop = true;

    const enableAudio = () => { if (audioRef.current.ctx?.state === 'suspended') audioRef.current.ctx.resume(); };
    window.addEventListener('click', enableAudio, { once: true });
    return () => window.removeEventListener('click', enableAudio);
  }, []);

  const playDingSound = useCallback(() => {
    const ctx = audioRef.current.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    gain.gain.setValueAtTime(1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.5);
  }, []);

  const playBGM = useCallback((src: string) => {
    const { bgm } = audioRef.current;
    if (!bgm) return;
    clearInterval(audioRef.current.fadeInt);
    clearTimeout(audioRef.current.dipTimeout);
    bgm.src = src;
    bgm.volume = 0;
    const playPromise = bgm.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        let vol = 0;
        audioRef.current.fadeInt = setInterval(() => {
          if (vol < 0.6) { vol += 0.05; bgm.volume = Math.min(vol, 0.6); } 
          else clearInterval(audioRef.current.fadeInt);
        }, 100);
      }).catch((e: any) => console.log("BGM play prevented:", e));
    }
  }, []);

  const stopBGM = useCallback(() => {
    const { bgm } = audioRef.current;
    if (!bgm) return;
    clearInterval(audioRef.current.fadeInt);
    clearTimeout(audioRef.current.dipTimeout);
    let vol = bgm.volume;
    audioRef.current.fadeInt = setInterval(() => {
      if (vol > 0.05) { vol -= 0.1; bgm.volume = Math.max(vol, 0); } 
      else { clearInterval(audioRef.current.fadeInt); bgm.pause(); bgm.currentTime = 0; }
    }, 100);
  }, []);

  const dipBGM = useCallback(() => {
    const { bgm } = audioRef.current;
    if (!bgm) return;
    clearInterval(audioRef.current.fadeInt);
    clearTimeout(audioRef.current.dipTimeout);
    let vol = bgm.volume;
    audioRef.current.fadeInt = setInterval(() => {
      if (vol > 0.15) { vol -= 0.05; bgm.volume = Math.max(vol, 0.15); } 
      else {
        clearInterval(audioRef.current.fadeInt);
        audioRef.current.dipTimeout = setTimeout(() => {
          audioRef.current.fadeInt = setInterval(() => {
            if (vol < 0.6) { vol += 0.05; bgm.volume = Math.min(vol, 0.6); } 
            else clearInterval(audioRef.current.fadeInt);
          }, 100);
        }, 3500);
      }
    }, 100);
  }, []);

  // ==========================================
  // 6. 雲端與打卡紀錄系統
  // ==========================================
  const logTraining = async (moduleName: string, durationSec: number) => {
    if (!lineProfile.uid || lineProfile.uid === '未登入') return;
    try {
      const { error } = await supabase.from('training_logs').insert([{ line_uid: lineProfile.uid, module_name: moduleName, duration: durationSec }]);
      if (error) console.error('❌ Supabase 寫入錯誤:', error);
    } catch (err) { console.error('❌ 寫入發生錯誤:', err); }
  };

  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const recordModuleCompletion = (type: string) => {
    if (!['sop', 'stretch', 'chaser', 'breathe', 'focus'].includes(type)) return;
    const today = getTodayString();
    const modulesKey = `rehab_modules_${today}`;
    const cyclesKey = `rehab_cycles_${today}`;
    let modulesDone = JSON.parse(localStorage.getItem(modulesKey) || '[]');
    let cycles = parseInt(localStorage.getItem(cyclesKey) || '0', 10);

    if (!modulesDone.includes(type)) modulesDone.push(type);
    if (modulesDone.length >= 4) {
      cycles++;
      localStorage.setItem(cyclesKey, cycles.toString());
      localStorage.setItem(modulesKey, JSON.stringify([])); 
    } else {
      localStorage.setItem(modulesKey, JSON.stringify(modulesDone));
    }
    loadCalendarData();
  };

  const loadCalendarData = useCallback(() => {
    const d = new Date();
    const year = d.getFullYear(); const month = d.getMonth(); const todayDate = d.getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let monthCycles = 0;
    const days = Array(firstDay).fill(-1); 
    
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const cycles = parseInt(localStorage.getItem(`rehab_cycles_${dateStr}`) || '0', 10);
      monthCycles += cycles;
      days.push(cycles);
    }
    
    const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;
    const todayCycles = parseInt(localStorage.getItem(`rehab_cycles_${todayStr}`) || '0', 10);

    setCalendarData({ todayCycles, monthCycles, days, today: todayDate, year, month });
  }, []);

  const handleShareCalendar = () => {
    if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href }); return; }
    const name = lineProfile.name || '我';
    if (liff.isApiAvailable('shareTargetPicker')) {
      liff.shareTargetPicker([{
        type: "text",
        text: `👁️ 彥臣數位眼科復健中心打卡！\n${name}今天已經完成 ${calendarData.todayCycles} 次完整的眼部復健運動，這個月已經完成 ${calendarData.monthCycles} 次眼部復健大循環。跟我一起保護眼睛吧！\n✨ 請搭配視祐全、新視祐全，補充眼睛關鍵營養！\n👉 https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID || '2010891900-u4t0FhJ6'}`
      }]).then((res) => { if (res) console.log("Shared"); }).catch((e) => alert("分享取消或發生錯誤。"));
    }
  };

  // ==========================================
  // 7. LIFF 初始化
  // ==========================================
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID || '2010891900-u4t0FhJ6' });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineProfile({ uid: profile.userId, name: profile.displayName });
        }
      } catch (err) { console.error('LIFF 初始化失敗:', err); }
    };
    initLiff();
    loadCalendarData();
  }, [loadCalendarData]);

  // ==========================================
  // 8. Three.js 引擎初始化
  // ==========================================
  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f141e);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    canvasRef.current.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xfffdd0, 0.6));

    const sopGroup = new THREE.Group(); sopGroup.position.y = 12;
    const sopMat = new THREE.MeshStandardMaterial({ color: 0x6b8e23, emissive: 0x2e4b1c, wireframe: true, transparent: true });
    const focusTarget = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 32), sopMat);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true });
    focusTarget.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), coreMat));
    sopGroup.add(focusTarget); scene.add(sopGroup);

    const stretchGroup = new THREE.Group();
    const stretchOrb = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 32), new THREE.MeshBasicMaterial({ color: 0xff9900 }));
    stretchOrb.add(new THREE.PointLight(0xffaa00, 2.5, 60)); stretchGroup.add(stretchOrb); scene.add(stretchGroup);

    const chaserGroup = new THREE.Group();
    const chaserOrb = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true }));
    chaserOrb.add(new THREE.PointLight(0xffd700, 2.5, 80)); chaserGroup.add(chaserOrb); scene.add(chaserGroup);

    const breatheGroup = new THREE.Group();
    const particleCount = 2000; const particlesGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    for(let i = 0; i < particleCount * 3; i++) posArray[i] = (Math.random() - 0.5) * 60;
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMat = new THREE.PointsMaterial({ size: 0.15, color: 0x00ffcc, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    const particleSystem = new THREE.Points(particlesGeo, particlesMat);
    breatheGroup.add(particleSystem); breatheGroup.position.z = -20; scene.add(breatheGroup);

    const focusGroup = new THREE.Group();
    const focusRing = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.8, 32, 1, 0, Math.PI * 1.7), new THREE.MeshBasicMaterial({ color: 0xff3366, side: THREE.DoubleSide, transparent: true }));
    focusGroup.add(focusRing); scene.add(focusGroup);

    const amslerGroup = new THREE.Group();
    const gridHelper = new THREE.GridHelper(30, 30, 0x557799, 0x445566);
    gridHelper.rotation.x = Math.PI / 2; gridHelper.position.z = -15; amslerGroup.add(gridHelper);
    const centerDot = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    centerDot.position.z = -14.9; amslerGroup.add(centerDot); scene.add(amslerGroup);

    const astigGroup = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(25, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      line.rotation.z = (i * Math.PI) / 12; astigGroup.add(line);
    }
    const astigCenterDot = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    astigCenterDot.position.z = 0.1; astigGroup.add(astigCenterDot); astigGroup.position.z = -25; scene.add(astigGroup);

    const allModules = [sopGroup, stretchGroup, chaserGroup, breatheGroup, focusGroup, amslerGroup, astigGroup];
    allModules.forEach(m => m.visible = false);
    const stimulusBalls: any[] = [];

    engineRef.current = {
      start: (mod: string) => {
        allModules.forEach(m => m.visible = false);
        if (mod === 'sop') { sopGroup.visible = true; sopMat.opacity = 1; coreMat.opacity = 1; }
        if (mod === 'stretch') { stretchGroup.visible = true; stretchOrb.position.set(0,0,-30); }
        if (mod === 'chaser') { chaserGroup.visible = true; breatheGroup.visible = true; chaserOrb.position.set((Math.random()-0.5)*20, (Math.random()-0.5)*15, -10); chaserOrb.scale.setScalar(1); chaserOrb.material.opacity = 1; }
        if (mod === 'breathe') { breatheGroup.visible = true; }
        if (mod === 'focus') { focusGroup.visible = true; focusGroup.position.z = focusDepths[0]; focusRing.material.color.setHex(focusColors[0]); }
        if (mod === 'amsler') { amslerGroup.visible = true; }
        if (mod === 'astigmatism') { astigGroup.visible = true; }
      },
      spawnBall: () => {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), new THREE.MeshBasicMaterial({ color: 0xf5f5dc, transparent: true, opacity: 0.8, depthWrite: false }));
        ball.position.set((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, -70);
        sopGroup.add(ball); stimulusBalls.push(ball);
      },
      updateFocusRing: (step: number) => {
        focusRing.material.color.setHex(focusColors[step]);
        focusRing.rotation.z = Math.floor(Math.random() * 4) * (Math.PI / 2);
      },
      clearBalls: () => {
        stimulusBalls.forEach(b => { if(b.parent) b.parent.remove(b); b.geometry.dispose(); b.material.dispose(); });
        stimulusBalls.length = 0;
      }
    };

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const mod = gameState.current.module;
      if (mod === 'DASHBOARD') { renderer.render(new THREE.Scene(), camera); return; }
      
      const time = Date.now(); const timeDelta = time * 0.0012;
      
      if (mod === 'sop' && gameState.current.phase !== 'COMPLETED') {
        focusTarget.rotation.x += 0.002; focusTarget.rotation.y += 0.003; focusTarget.position.z = -50;
        const scale = 1 + Math.cos(timeDelta) * 0.25; focusTarget.scale.set(scale, scale, scale);
        const targetOpacity = (gameState.current.phase === 'CLOSING') ? 0.05 : 1.0;
        sopMat.opacity += (targetOpacity - sopMat.opacity) * 0.05; coreMat.opacity += (targetOpacity - coreMat.opacity) * 0.05;
        
        for (let i = stimulusBalls.length - 1; i >= 0; i--) {
          const ball = stimulusBalls[i]; ball.position.z += 1.5;
          if (ball.position.z > -10) { ball.position.z += 3.0; ball.scale.addScalar(0.8); ball.material.opacity = 1.0; ball.material.color.setHex(0xffffff); } 
          else ball.scale.addScalar(0.015);
          if (ball.position.z > camera.position.z) { if(ball.parent) ball.parent.remove(ball); ball.geometry.dispose(); ball.material.dispose(); stimulusBalls.splice(i, 1); }
        }
      }
      if (mod === 'stretch' && gameState.current.stretchTimeLeft > 0) {
        const speed = timeDelta; stretchOrb.scale.setScalar(1 + Math.cos(speed * 3) * 0.1);
        const isMobile = window.innerWidth < 600;
        stretchOrb.position.set(Math.sin(speed) * (isMobile ? 8.5 : 18), Math.sin(speed * 2) * (isMobile ? 12 : 8), -30 + Math.sin(speed * 0.5) * 20);
      }
      if (mod === 'breathe' || mod === 'chaser') {
        particleSystem.rotation.y += 0.0005; particleSystem.rotation.z += 0.0002;
      }
      if (mod === 'chaser' && gameState.current.chaserTimeLeft > 0) {
        chaserOrb.position.z -= 0.6;
        if (chaserOrb.position.z < -120) { 
          gameState.current.chaserScore++; playDingSound(); 
          chaserOrb.position.set((Math.random()-0.5)*20, (Math.random()-0.5)*15, -10); chaserOrb.scale.setScalar(1); chaserOrb.material.opacity = 1;
        } else {
          const progress = (chaserOrb.position.z + 10) / -110;
          const currentScale = Math.max(0, 1 - progress * 0.9); chaserOrb.scale.setScalar(currentScale);
          chaserOrb.material.opacity = 1 - Math.pow(progress, 3);
        }
      }
      if (mod === 'breathe' && gameState.current.breatheTimeLeft > 0) {
        const breathCycle = Math.sin((time % 10000) / 10000 * Math.PI * 2);
        const currentScale = 1.05 + breathCycle * 0.25; particleSystem.scale.setScalar(currentScale);
        particlesMat.color.setHSL(0.5 + breathCycle * 0.1, 0.8, 0.4 + breathCycle * 0.2);
      }
      if (mod === 'focus' && gameState.current.focusTimeLeft > 0) {
        focusGroup.position.z += (focusDepths[gameState.current.focusStep] - focusGroup.position.z) * 0.15;
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); cancelAnimationFrame(animationFrameId); if (canvasRef.current) canvasRef.current.removeChild(renderer.domElement); renderer.dispose(); };
  }, [playDingSound]);

  // ==========================================
  // 9. 狀態機與強制置中邏輯 
  // ==========================================
  const updateUI = useCallback(() => {
    const state = gameState.current;
    if (state.module === 'sop') {
      if (state.phase === 'COMPLETED') setUiState({ top: '35%', title: "🎉 3 回合深層放鬆完成！", timer: '', showContinue: false });
      else if (state.phase === 'LOOKING') setUiState({ top: '70%', title: `(第 ${state.cycle}/${maxCycles} 回合)\n請柔和注視中心橘點`, timer: `剩餘 ${state.sopTimeLeft} 秒`, showContinue: false });
      else if (state.phase === 'CLOSING') setUiState({ top: '70%', title: "請用力閉上雙眼，徹底放鬆", timer: `剩餘 ${state.sopTimeLeft} 秒`, showContinue: false });
    } else if (state.module === 'stretch') {
      if (state.stretchTimeLeft > 0) setUiState({ top: '80%', title: "保持頭部靜止\n跟隨光球移動伸展眼肌", timer: `剩餘 ${state.stretchTimeLeft} 秒`, showContinue: false });
      else if (state.isResting) setUiState({ top: '50%', title: "請閉眼休息5秒鐘", timer: `休息 ${state.restTimeLeft} 秒`, showContinue: false });
      else setUiState({ top: '50%', title: "🎉 眼肌與焦距重訓完成！", timer: '', showContinue: false });
    } else if (state.module === 'chaser') {
      if (state.chaserTimeLeft > 0) setUiState({ top: '80%', title: `【睫狀肌深空追光】\n死盯流星飛向最深處直到消失\n(已追蹤: ${state.chaserScore} 顆)`, timer: `遊戲剩餘：${state.chaserTimeLeft} 秒`, showContinue: false });
      else if (state.isResting) setUiState({ top: '50%', title: "請閉眼休息5秒鐘", timer: `休息 ${state.restTimeLeft} 秒`, showContinue: false });
      else setUiState({ top: '50%', title: `🎮 遊戲結束！\n您成功追蹤了 ${state.chaserScore} 顆深空流星`, timer: "睫狀肌已獲得充分的遠眺放鬆", showContinue: false });
    } else if (state.module === 'breathe') {
      if (state.breatheTimeLeft > 0) {
        const action = state.breathPhase === 'INHALE' ? "跟隨星雲【緩慢吸氣】" : "跟隨星雲【徹底吐氣】";
        setUiState({ top: '85%', title: `${action}\n(請不要對焦任何星星，放寬視野)`, timer: `深度放鬆中：${state.breatheTimeLeft} 秒`, showContinue: false });
      } else if (state.isResting) setUiState({ top: '50%', title: "請閉眼休息5秒鐘", timer: `休息 ${state.restTimeLeft} 秒`, showContinue: false });
      else setUiState({ top: '50%', title: "🌌 視覺神經與自律神經已深度重置", timer: "現在您的眼睛處於最佳狀態", showContinue: false });
    } else if (state.module === 'focus') {
      if (state.isWaitingForRightEye) setUiState({ top: '70%', title: "👁️ 左眼訓練完成！\n請換遮左眼，準備進行【右眼】重訓", timer: '', showContinue: true });
      else if (state.focusTimeLeft > 0) {
        // 使用 <div> 搭配 w-full 與 text-center 強制置中，並使用 <br/> 取代 \n
        const eye = state.focusTimeLeft > 60 ? "👁️ 請遮住右眼，訓練【左眼】<br/><br/>" : "👁️ 換遮左眼，訓練【右眼】<br/><br/>";
        setUiState({ top: '85%', title: <div dangerouslySetInnerHTML={{ __html: eye + focusTexts[state.focusStep] }} className="w-full text-center flex flex-col items-center justify-center" />, timer: `重訓剩餘：${state.focusTimeLeft} 秒`, showContinue: false });
      } else if (state.isResting) setUiState({ top: '50%', title: "請閉眼休息5秒鐘", timer: `休息 ${state.restTimeLeft} 秒`, showContinue: false });
      else setUiState({ top: '50%', title: <div dangerouslySetInnerHTML={{ __html: "🎯 睫狀肌幫浦重訓完成！<br/><br/><span style='font-size:18px; color:#FFD93D;'>⚠️ 提醒您：如果覺得眼睛累了請適當休息，<br/>建議接著進行前四個眼睛放鬆模組。</span>" }} className="w-full text-center flex flex-col items-center" />, timer: '', showContinue: false });
    } else if (state.module === 'amsler' || state.module === 'astigmatism') {
      if (state.testPhase === 'COMPLETED') setUiState({ top: '50%', title: "檢測完成！若有異常請檢查視力與散光度數", timer: "點擊左上角返回大廳", showContinue: false });
      else {
        const eye = state.testPhase === 'LEFT_EYE' ? "左眼" : "右眼"; const cover = state.testPhase === 'LEFT_EYE' ? "右眼" : "左眼";
        const desc = state.module === 'amsler' ? "(觀察周圍網格是否扭曲或有黑影)" : "(觀察線條是否有些特別黑粗、或模糊發淡？)";
        setUiState({ top: '80%', title: `【檢測${eye}】請遮住${cover}，注視中心\n${desc}`, timer: `檢測中：${state.testTimeLeft} 秒`, showContinue: false });
      }
    }
  }, []);

  useEffect(() => {
    const timerId = setInterval(() => {
      const state = gameState.current;
      if (state.module === 'DASHBOARD') return;

      if (['stretch', 'chaser', 'breathe', 'focus'].includes(state.module) && state.isResting) {
        state.restTimeLeft--;
        if (state.restTimeLeft <= 0) { state.isResting = false; playDingSound(); }
        updateUI(); return;
      }

      if (state.module === 'sop') {
        if (state.phase === 'COMPLETED') return;
        state.sopTimeLeft--;
        if (state.phase === 'LOOKING' && state.sopTimeLeft === 3) engineRef.current?.spawnBall();
        if (state.sopTimeLeft <= 0) {
          if (state.phase === 'LOOKING') { state.phase = 'CLOSING'; state.sopTimeLeft = 5; }
          else if (state.phase === 'CLOSING') {
            state.cycle++;
            if (state.cycle > maxCycles) { state.phase = 'COMPLETED'; dipBGM(); playDingSound(); recordModuleCompletion('sop'); logTraining('45秒快速舒緩', 45); }
            else { state.phase = 'LOOKING'; state.sopTimeLeft = 10; playDingSound(); }
          }
        }
      } else if (state.module === 'stretch') {
        if (state.stretchTimeLeft <= 0) return;
        state.stretchTimeLeft--;
        if (state.stretchTimeLeft <= 0) { state.isResting = true; state.restTimeLeft = 5; dipBGM(); playDingSound(); recordModuleCompletion('stretch'); logTraining('動態 3D 眼肌伸展', 45); }
      } else if (state.module === 'chaser') {
        if (state.chaserTimeLeft <= 0) return;
        state.chaserTimeLeft--;
        if (state.chaserTimeLeft <= 0) { state.isResting = true; state.restTimeLeft = 5; dipBGM(); playDingSound(); recordModuleCompletion('chaser'); logTraining('睫狀肌深空追光', 60); }
      } else if (state.module === 'breathe') {
        if (state.breatheTimeLeft <= 0) return;
        state.breatheTimeLeft--;
        if (state.breatheTimeLeft > 0) {
          if (state.breatheTimeLeft % 10 === 5) { state.breathPhase = 'INHALE'; playDingSound(); }
          else if (state.breatheTimeLeft % 10 === 0) { state.breathPhase = 'EXHALE'; playDingSound(); }
        } else { state.isResting = true; state.restTimeLeft = 5; dipBGM(); playDingSound(); recordModuleCompletion('breathe'); logTraining('星雲散焦與神經放鬆', 60); }
      } else if (state.module === 'focus') {
        if (state.isWaitingForRightEye) return;
        if (state.focusTimeLeft <= 0) return;
        state.focusTimeLeft--; state.focusHoldTime--;
        
        if (state.focusTimeLeft === 90) state.focusCycleSpeed = 2;
        if (state.focusTimeLeft === 75) state.focusCycleSpeed = 1.5;
        if (state.focusTimeLeft === 60) { playDingSound(); state.focusCycleSpeed = 3; state.isWaitingForRightEye = true; }
        if (state.focusTimeLeft === 30) state.focusCycleSpeed = 2;
        if (state.focusTimeLeft === 15) state.focusCycleSpeed = 1.5;

        if (state.focusHoldTime <= 0 && state.focusTimeLeft > 0) {
          state.focusStep += state.focusDirection;
          if (state.focusStep >= 3) { state.focusStep = 3; state.focusDirection = -1; }
          else if (state.focusStep <= 0) { state.focusStep = 0; state.focusDirection = 1; }
          state.focusHoldTime = state.focusCycleSpeed;
          engineRef.current?.updateFocusRing(state.focusStep);
        }
        if (state.focusTimeLeft <= 0) { state.isResting = true; state.restTimeLeft = 5; dipBGM(); playDingSound(); recordModuleCompletion('focus'); logTraining('Z 軸遠近對焦飛梭', 120); }
      } else if (state.module === 'amsler' || state.module === 'astigmatism') {
        if (state.testPhase === 'COMPLETED') return;
        state.testTimeLeft--;
        if (state.testTimeLeft <= 0) {
          if (state.testPhase === 'LEFT_EYE') { state.testPhase = 'RIGHT_EYE'; state.testTimeLeft = 15; playDingSound(); }
          else { state.testPhase = 'COMPLETED'; playDingSound(); logTraining(state.module === 'amsler' ? '黃斑部自我檢測' : '散光軸向自我檢測', 30); }
        }
      }
      updateUI();
    }, 1000);
    return () => clearInterval(timerId);
  }, [playDingSound, dipBGM, updateUI, logTraining]);

  // ==========================================
  // 10. 視圖切換與按鈕處理 (綁定 NoSleep)
  // ==========================================
  const startTraining = (type: string) => {
    setActiveModule(type); setCurrentView('TRAINING');
    const state = gameState.current;
    state.module = type; state.isResting = false; state.restTimeLeft = 0;
    
    // 啟動防休眠機制
    if (noSleepRef.current) {
      noSleepRef.current.enable();
    }
    
    if (type === 'sop') { state.cycle = 1; state.phase = 'LOOKING'; state.sopTimeLeft = 10; playBGM('/game1.mp3'); }
    else if (type === 'stretch') { state.stretchTimeLeft = 45; playBGM('/game2.mp3'); }
    else if (type === 'chaser') { state.chaserTimeLeft = 60; state.chaserScore = 0; playBGM('/game3.mp3'); }
    else if (type === 'breathe') { state.breatheTimeLeft = 60; state.breathPhase = 'INHALE'; playBGM('/game4.mp3'); }
    else if (type === 'focus') { state.focusTimeLeft = 120; state.focusStep = 0; state.focusDirection = 1; state.focusHoldTime = 3; state.focusCycleSpeed = 3; state.isWaitingForRightEye = false; playBGM('/game5.mp3'); }
    else if (type === 'amsler' || type === 'astigmatism') { state.testPhase = 'LEFT_EYE'; state.testTimeLeft = 15; }
    
    engineRef.current?.start(type);
    updateUI();
  };

  const returnToDashboard = () => {
    if (['sop', 'stretch', 'chaser', 'breathe', 'focus'].includes(gameState.current.module)) stopBGM();
    gameState.current.module = 'DASHBOARD';
    engineRef.current?.clearBalls();
    
    // 關閉防休眠機制
    if (noSleepRef.current) {
      noSleepRef.current.disable();
    }
    
    setCurrentView('DASHBOARD'); setActiveModule(null);
  };

  const showModuleIntro = (type: string) => { setActiveModule(type); setCurrentView('INFO_INTRO'); };

  // ==========================================
  // 11. React JSX 渲染樹
  // ==========================================
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f141e] font-sans">
      <div ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {currentView === 'DASHBOARD' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-start py-10 px-5 overflow-y-auto box-border">
          <h1 className="text-[#fffdd0] text-[32px] text-center mb-[15px] tracking-[1px]">
            <div className="text-[55px] mb-[10px]">👁️</div>數位眼科與視覺復健中心
          </h1>
          <p className={`text-[20px] text-center leading-[1.5] mb-[30px] break-keep ${lineProfile.uid !== '未登入' ? 'text-[#00ffcc]' : 'text-[#8b9bb4]'}`}>
            {lineProfile.uid !== '未登入' ? `歡迎回來，${lineProfile.name}！請選擇您的專屬放鬆模組` : (
              <>請選擇您的專屬眼部放鬆與訓練模組<br />
                <button onClick={() => liff.login({ redirectUri: window.location.href })} className="mt-[15px] px-6 py-2.5 bg-[#06C755] text-white border-none rounded-full text-[18px] font-bold cursor-pointer shadow-[0_4px_10px_rgba(6,199,85,0.3)]">🟢 使用 LINE 一鍵登入</button>
              </>
            )}
          </p>
          
          <div className="w-full max-w-[800px] flex flex-col gap-5 mb-[40px]">
            <div onClick={() => setCurrentView('INFO_NUTRIENT')} className="w-full bg-[#162b2b] border-2 border-[#00ffcc] rounded-xl p-5 cursor-pointer shadow-[0_0_15px_rgba(0,255,204,0.2)] text-center transition-all duration-200 hover:scale-[1.02]">
              <h3 className="text-[#00ffcc] text-[22px] mb-2 font-bold">📖 護眼常見營養素與 RPE 百科</h3>
              <p className="text-[#8b9bb4] text-[16px] m-0">點擊了解護眼成分作用部位，以及視網膜垃圾處理廠 (RPE) 的重要性</p>
            </div>
            <div onClick={() => setCurrentView('CALENDAR')} className="w-full bg-[#161b22] border-2 border-[#4D96FF] rounded-xl p-5 cursor-pointer shadow-[0_0_15px_rgba(77,150,255,0.2)] text-center transition-all duration-200 hover:scale-[1.02]">
              <h3 className="text-[#4D96FF] text-[22px] mb-2 font-bold">📅 每月復健進度</h3>
              <p className="text-[#8b9bb4] text-[16px] m-0">點擊查看您的打卡紀錄，分享給家人與醫師</p>
            </div>
            
            <div className="flex flex-col gap-5 w-full">
              <ModuleCard title="🚀 45秒快速舒緩" desc="結合遠眺聚焦、隨機白球衝擊與深層閉眼潤滑。" color="#FF6B6B" onClick={() => showModuleIntro('sop')} />
              <ModuleCard title="🔄 動態 3D 眼肌伸展" desc="引導眼球進行 ∞ 字型極限軌跡，強迫拉伸控制眼球的六條眼外肌。" color="#4D96FF" onClick={() => showModuleIntro('stretch')} />
              <ModuleCard title="🎮 睫狀肌深空追光" desc="【放鬆遊戲】死盯流星飛向深空，強迫睫狀肌徹底看遠放鬆。" color="#6BCB77" onClick={() => showModuleIntro('chaser')} />
              <ModuleCard title="🌌 星雲散焦與神經放鬆" desc="【深度冥想】釋放隧道視覺，同步 3D 粒子星雲進行共振呼吸。" color="#FFD93D" onClick={() => showModuleIntro('breathe')} />
              <ModuleCard title="🎯 Z 軸遠近對焦飛梭" desc="高強度睫狀肌重訓！利用極端遠近切換，恢復眼球對焦彈性。" color="#FF3366" onClick={() => showModuleIntro('focus')} />
              <ModuleCard title="🔍 黃斑部自我檢測" desc="經典阿姆斯勒方格表數位化，快篩視網膜病變風險。" color="#9D4EDD" onClick={() => startTraining('amsler')} />
              <ModuleCard title="👁️ 散光軸向自我檢測" desc="放射鐘測試。檢測是否因散光未矯正而導致嚴重疲勞。" color="#FF9F1C" onClick={() => startTraining('astigmatism')} />
            </div>

            <div onClick={() => setCurrentView('AD')} className="w-full border-2 border-dashed border-[#ffff00] rounded-xl p-5 cursor-pointer flex justify-between items-center box-border mt-4">
              <div className="text-[#fffdd0] text-[18px] font-bold flex items-center gap-2.5"><span className="text-[#ffff00] text-[22px]">💡</span> 補充眼睛完整營養</div>
              <div className="text-[#666] text-[20px] font-bold">&gt;</div>
            </div>
          </div>
        </div>
      )}

      {currentView === 'CALENDAR' && (
        <div className="absolute inset-0 z-50 bg-[#0f141e] overflow-y-auto p-5 box-border">
          <div className="max-w-[800px] mx-auto pb-[50px]">
            <button onClick={() => setCurrentView('DASHBOARD')} className="px-6 py-3 bg-[#1a2233] text-[#fffdd0] border border-[#2a3a5a] rounded-lg mb-5 cursor-pointer text-[18px] font-bold">🔙 返回大廳</button>
            <div className="w-full bg-[#161b22] rounded-2xl p-6 box-border shadow-[0_10px_25px_rgba(0,0,0,0.5)]">
              <h2 className="text-[#E5B55E] text-center text-[32px] m-0 mb-[15px] font-bold">{calendarData.year} 年 {calendarData.month + 1} 月</h2>
              <p className="text-[#8b9bb4] text-center text-[18px] m-0 mb-[5px]">建議搭配PPLs®晶亮配方，每天復健三次</p>
              <p className="text-[#8b9bb4] text-center text-[18px] m-0 mb-[25px]">還有最重要的眼睛要適度的休息</p>
              <div className="grid grid-cols-7 gap-[5px] mb-[15px]">
                {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} className="text-[#888] text-center text-[18px]">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-y-2.5 gap-x-1.5">
                {calendarData.days.map((cycles, idx) => (
                  <div key={idx} className={`flex items-center justify-center w-[44px] h-[44px] mx-auto rounded-full text-[20px] font-bold ${cycles === -1 ? 'bg-transparent text-transparent' : cycles === 0 ? 'bg-[#2a3241] text-[#6b7280]' : cycles === 1 ? 'bg-[#4D96FF] text-white' : cycles === 2 ? 'bg-[#6BCB77] text-white' : 'bg-[#FF9F1C] text-white'} ${(idx - (calendarData.days.length - (new Date(calendarData.year, calendarData.month + 1, 0).getDate())) + 1) === calendarData.today ? 'border-2 border-[#E5B55E]' : ''}`}>
                    {cycles === -1 ? '' : idx - (calendarData.days.length - (new Date(calendarData.year, calendarData.month + 1, 0).getDate())) + 1}
                  </div>
                ))}
              </div>
              <button onClick={handleShareCalendar} className="w-full p-[18px] mt-[25px] bg-[#2B579A] text-white border-none rounded-xl text-[20px] font-bold cursor-pointer">▷ 傳送每月復健次數</button>
            </div>
          </div>
        </div>
      )}

      {currentView === 'INFO_NUTRIENT' && (
        <div className="absolute inset-0 z-50 bg-[#0f141e] overflow-y-auto p-5 box-border">
          <div className="max-w-[800px] mx-auto pb-[50px]">
            <button onClick={() => setCurrentView('DASHBOARD')} className="px-6 py-3 bg-[#1a2233] text-[#fffdd0] border border-[#2a3a5a] rounded-lg mb-5 cursor-pointer text-[18px] font-bold">返回大廳</button>
            <h2 className="text-[#fffdd0] text-[28px] border-b-2 border-[#00ffcc] pb-2.5 mb-[15px] font-bold">護眼營養素與眼睛構造對照表</h2>
            <p className="text-[#8b9bb4] text-[18px] leading-[1.6] mb-5 bg-[#162b2b] p-4 rounded-lg">
              <strong className="text-[#00ffcc]">閱讀重點｜</strong>營養素通常是維持組織正常功能或降低缺乏風險，不能取代眼科檢查與治療。Propolins 最適合定位在視網膜色素上皮（RPE），目前證據為人類細胞與動物模型，尚非人體臨床療效。
            </p>
            <div className="overflow-x-auto mb-[30px]">
              <table className="w-full border-collapse text-[#fffdd0] text-[17px] leading-[1.6]">
                <thead>
                  <tr className="bg-[#1a2233] text-left">
                    <th className="p-3.5 border border-[#2a3a5a]">營養素／成分</th><th className="p-3.5 border border-[#2a3a5a]">主要相關部位</th><th className="p-3.5 border border-[#2a3a5a]">作用與目前證據</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="p-3.5 border border-[#2a3a5a] text-[#00ffcc] font-bold">葉黃素、玉米黃素</td><td className="p-3.5 border border-[#2a3a5a]">黃斑部、中央凹</td><td className="p-3.5 border border-[#2a3a5a]">構成黃斑色素，與中央視力、辨色有關；最直接對應黃斑部的營養素。</td></tr>
                  <tr className="bg-[#162b2b]"><td className="p-3.5 border border-[#2a3a5a] text-[#00ffcc] font-bold">Propolins (尤其G)</td><td className="p-3.5 border border-[#2a3a5a]">視網膜色素上皮RPE；外層視網膜界面</td><td className="p-3.5 border border-[#2a3a5a]">細胞實驗顯示可提高損傷下存活；乾性AMD大鼠模型中，ERG c-wave部分恢復表示RPE功能改善。</td></tr>
                  <tr><td className="p-3.5 border border-[#2a3a5a] text-[#00ffcc] font-bold">維生素A／β-胡蘿蔔素</td><td className="p-3.5 border border-[#2a3a5a]">視網膜桿狀細胞；角結膜</td><td className="p-3.5 border border-[#2a3a5a]">維持眼表上皮；缺乏可能夜盲或乾眼。</td></tr>
                  <tr><td className="p-3.5 border border-[#2a3a5a] text-[#00ffcc] font-bold">DHA & Omega-3</td><td className="p-3.5 border border-[#2a3a5a]">感光細胞膜 / 淚膜、眼表</td><td className="p-3.5 border border-[#2a3a5a]">具生理結構角色；可能影響發炎與淚膜油脂層。</td></tr>
                  <tr><td className="p-3.5 border border-[#2a3a5a] text-[#00ffcc] font-bold">維生素C、E、鋅、銅</td><td className="p-3.5 border border-[#2a3a5a]">水晶體、黃斑部</td><td className="p-3.5 border border-[#2a3a5a]">抗氧化營養素，組成AREDS2可延緩特定AMD惡化。不適合未經診斷自行長期高劑量服用。</td></tr>
                  <tr><td className="p-3.5 border border-[#2a3a5a] text-[#00ffcc] font-bold">維生素B1、B12、葉酸</td><td className="p-3.5 border border-[#2a3a5a]">視神經</td><td className="p-3.5 border border-[#2a3a5a]">嚴重缺乏可能造成營養性視神經病變；主要為避免缺乏。</td></tr>
                </tbody>
              </table>
            </div>
            <h3 className="text-[#fffdd0] mb-3 text-[20px] font-bold">⚠️ 補充品使用注意</h3>
            <ul className="text-[#8b9bb4] text-[17px] leading-[1.8] mb-[30px] pl-5 list-disc">
              <li><strong className="text-[#fffdd0]">不可自行點眼：</strong>專利式(II)是研究用眼科製劑，市售口服蜂膠絕不可自行滴入眼睛。</li>
              <li><strong className="text-[#fffdd0]">證據界線：</strong>Propolins 支持的是「受損RPE的細胞保護」，目前為細胞與動物前臨床證據，不能據此宣稱預防或治療人體AMD。</li>
              <li><strong className="text-[#fffdd0]">AREDS2：</strong>只適用眼科醫師判定的特定AMD；健康人或單純疲勞者不應自行套用高劑量配方。</li>
              <li><strong className="text-[#fffdd0]">就醫警訊：</strong>出現視野扭曲、單眼黑影/閃光、視力下降等，應盡快就醫，不應只靠補充品觀察。</li>
            </ul>
            <div className="text-center mt-10">
              <button onClick={() => setCurrentView('INFO_RPE')} className="px-[30px] py-[15px] bg-[#00ffcc] text-[#0f141e] border-none rounded-full text-[20px] font-bold cursor-pointer shadow-[0_4px_15px_rgba(0,255,204,0.4)]">👉 RPE 為什麼重要？</button>
            </div>
          </div>
        </div>
      )}

      {currentView === 'INFO_RPE' && (
        <div className="absolute inset-0 z-50 bg-[#0f141e] overflow-y-auto p-5 box-border">
          <div className="max-w-[800px] mx-auto pb-[50px]">
            <button onClick={() => setCurrentView('INFO_NUTRIENT')} className="px-6 py-3 bg-[#1a2233] text-[#fffdd0] border border-[#2a3a5a] rounded-lg mb-5 cursor-pointer text-[18px] font-bold">🔙 返回護眼營養素</button>
            <h2 className="text-[#fffdd0] text-[28px] border-b-2 border-[#00ffcc] pb-2.5 mb-5 font-bold">🏭 垃圾處理廠與清潔工：認識 RPE</h2>
            <div className="text-[#8b9bb4] text-[17px] leading-[1.8]">
              <p className="mb-[15px]">我們可以把眼底的「視網膜色素上皮細胞 (RPE)」想像成眼底的<strong className="text-[#fffdd0]">垃圾處理廠</strong>，而上方的感光細胞則是負責看東西的員工。</p>
              
              <h3 className="text-[#00ffcc] mt-[25px] mb-2.5 text-[20px] font-bold">一、什麼是脂褐質？它是怎麼形成的？</h3>
              <ul className="pl-5 mb-5 list-disc">
                <li><strong>員工天天產生垃圾：</strong>感光細胞每天工作會消耗能量，並脫落大量老舊廢棄物。</li>
                <li><strong>清潔工天天回收：</strong>健康的 RPE 每天會把垃圾吞進去，用溶小體酵素徹底分解化為養分。</li>
                <li><strong>變成陳年鐵鏽：</strong>若受藍光傷害或老化，處理廠酵素變弱。卡在肚子裡的油垢經光線照射後生鏽變質，形成了永遠無法清除的<strong className="text-[#ff6b6b]">「脂褐質」</strong>。</li>
              </ul>

              <h3 className="text-[#00ffcc] mt-[25px] mb-2.5 text-[20px] font-bold">二、 健康的 RPE（好工廠）：如何阻擋傷害？</h3>
              <p className="mb-[15px]">當你的垃圾處理廠（RPE 細胞）還很健康、體力很好時，它可以這樣保護眼睛：</p>
              <ul className="pl-5 mb-5 list-disc">
                <li><strong className="text-[#fffdd0]">天天清空垃圾：</strong>來多少廢棄物就吃多少、消化多少，不讓垃圾有機會在眼底生鏽變成脂褐質。</li>
                <li><strong className="text-[#fffdd0]">自帶超強防護罩：</strong>健康細胞體內有很多天然的防曬劑（黑色素與抗氧化酶），能把照進眼睛的有害光線擋掉，保護工廠機器不被曬壞。</li>
                <li><strong className="text-[#fffdd0]">精準控管原料：</strong>能把看東西需要的維生素 A 處理得很順暢，不會讓它們在眼底下亂套、亂結塊。</li>
              </ul>

              <h3 className="text-[#ff6b6b] mt-[25px] mb-2.5 text-[20px] font-bold">三、不健康的 RPE（爛工廠）帶來的災難</h3>
              <ul className="pl-5 mb-[25px] list-disc">
                <li><strong className="text-[#fffdd0]">1. 吃再多營養也吸收不了：</strong>就算吃再多高檔葉黃素，不健康的工廠也無法吸收利用。</li>
                <li><strong className="text-[#fffdd0]">2. 眼底長斑堆垃圾：</strong>肚子被脂褐質塞爆後，把垃圾往地基亂倒，形成「隱形斑(Drusen)」。</li>
                <li><strong className="text-[#fffdd0]">3. 眼睛結構大毀滅：</strong>防護牆破裂，引發濕性病變；最終員工集體餓死，導致視野中央出現黑洞失明。</li>
              </ul>
              
              <div className="bg-[#162b2b] p-5 rounded-lg text-center border border-[#00ffcc]">
                <p className="text-[#fffdd0] text-[19px] font-bold m-0">💡 總結</p>
                <p className="text-[#00ffcc] text-[18px] mt-2.5 mb-0">「健康的 RPE 能幫解消滅垃圾；<br />不健康的 RPE 會讓垃圾（脂褐質）堆成高山，最後把你的視力連根拔起。」</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentView === 'INFO_INTRO' && activeModule && (
        <div className="absolute inset-0 z-50 bg-[#0f141e] overflow-y-auto p-5 box-border">
          <div className="max-w-[800px] mx-auto pb-[50px]">
            <button onClick={() => setCurrentView('DASHBOARD')} className="px-6 py-3 bg-[#1a2233] text-[#fffdd0] border border-[#2a3a5a] rounded-lg mb-5 cursor-pointer text-[18px] font-bold">🔙 返回大廳</button>
            <h2 className="text-[#fffdd0] text-[32px] pb-2.5 mb-[25px] flex items-center gap-2.5 font-bold" style={{ borderBottom: `2px solid ${medicalPrinciples[activeModule].color}` }}>
              <span>{medicalPrinciples[activeModule].icon}</span> {medicalPrinciples[activeModule].title}
            </h2>
            <div className="bg-[#162b2b] p-6 rounded-xl mb-10 shadow-[0_0_15px_rgba(0,0,0,0.5)]" style={{ border: `1px solid ${medicalPrinciples[activeModule].color}` }}>
              <h3 className="text-[22px] mb-[15px] flex items-center gap-2 font-bold" style={{ color: medicalPrinciples[activeModule].color }}>
                <span>🩺</span> 數位復健醫學原理
              </h3>
              <p className="text-[#8b9bb4] text-[18px] leading-[1.8] m-0" dangerouslySetInnerHTML={{ __html: medicalPrinciples[activeModule].principle }}></p>
            </div>
            <div className="text-center">
              <button onClick={() => startTraining(activeModule)} className="px-[45px] py-[18px] text-[#0f141e] border-none rounded-full text-[22px] font-bold cursor-pointer" style={{ backgroundColor: medicalPrinciples[activeModule].color, boxShadow: `0 4px 15px ${medicalPrinciples[activeModule].color}60` }}>🚀 開始訓練</button>
            </div>
          </div>
        </div>
      )}

      {currentView === 'AD' && (
        <div className="absolute inset-0 z-50 bg-[#0f141e] overflow-y-auto p-5 box-border">
          <div className="max-w-[800px] mx-auto pb-[50px]">
            <button onClick={() => setCurrentView('DASHBOARD')} className="px-6 py-3 bg-[#1a2233] text-[#fffdd0] border border-[#2a3a5a] rounded-lg mb-5 cursor-pointer text-[18px] font-bold">🔙 返回大廳</button>
            <div className="bg-white rounded-[20px] p-[30px_20px] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
              <div className="flex justify-between items-center mb-[30px]">
                <div className="font-[900] text-[18px] text-[#b8982a]">PP<span className="text-[#333]">LS</span> <span className="text-[12px] text-[#999] font-normal tracking-[1px]">INSIDE</span></div>
              </div>
              <h2 className="text-center text-[#1A4B82] text-[28px] font-bold mb-[40px]">補充眼睛完整營養</h2>
              <div className="flex justify-center mb-[45px]">
                <div className="w-[260px] h-[380px] relative bg-white rounded-lg shadow-[0_15px_35px_rgba(0,0,0,0.15)] overflow-hidden border border-[#eaeaea]">
                  <div className="absolute right-0 top-0 w-[45%] h-full bg-[#1A4B82]" style={{ clipPath: 'polygon(25% 0, 100% 0, 100% 100%, 0 100%)' }}></div>
                  <div className="absolute left-0 top-0 w-full h-full p-[30px_20px] box-border flex flex-col text-left z-[2]">
                    <div className="text-[13px] text-[#666] font-bold mb-[25px]">PPLs® VisionCare</div>
                    <div className="mb-[35px]">
                      <div className="text-[14px] font-bold text-[#666] mb-0.5">第二代</div>
                      <div className="text-[28px] font-[900] text-[#1A4B82] border-b-[3px] border-[#1A4B82] inline-block pb-1">視祐全</div>
                      <div className="text-[13px] font-bold text-[#333] mt-2">專利配方效果好</div>
                    </div>
                    <div>
                      <div className="text-[28px] font-[900] text-[#1A4B82] border-b-[3px] border-[#1A4B82] inline-block pb-1">新視祐全</div>
                      <div className="text-[13px] font-bold text-[#333] mt-2">加了魚油更滋潤</div>
                    </div>
                    <div className="mt-auto text-[11px] text-[#666] font-bold">◼ 連續榮獲多項專利肯定</div>
                  </div>
                </div>
              </div>
              <div className="text-center mb-[35px] text-[20px] font-bold text-[#444] leading-[2]">
                <div>維持補充 每日 <span className="text-[#d9534f] text-[28px] mx-1">2</span> 粒</div>
                <div>加強提升 請洽專業藥師</div>
              </div>
              <div className="bg-[#f4f9ff] border-2 border-[#b3d4f0] rounded-[15px] p-[20px_15px] text-center mb-[25px]">
                <div className="text-[#1A4B82] text-[22px] font-bold mb-2">補充專利PPLs®配方</div>
                <div className="text-[#555] text-[15px] font-bold">營養進得去，廢物出得來</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 視圖 7: 訓練進行中 (TRAINING) */}
      {currentView === 'TRAINING' && (
        <>
          <button onClick={returnToDashboard} className="absolute top-5 left-5 px-6 py-3 bg-[#1a2233] text-[#fffdd0] border border-[#2a3a5a] rounded-lg font-bold text-[18px] cursor-pointer z-20 pointer-events-auto shadow-lg">🔙 返回大廳</button>
          
          <div className="absolute inset-x-0 w-full px-5 box-border flex flex-col items-center justify-center text-center pointer-events-none drop-shadow-[0px_4px_15px_rgba(0,0,0,0.9)] z-10 transition-all duration-[1.2s] ease-[cubic-bezier(0.25,1,0.5,1)]" style={{ top: uiState.top, transform: 'translateY(-50%)' }}>
            
            {/* 強制置中容器 */}
            <div className="w-full text-center text-[#fffdd0] text-[26px] font-bold tracking-[1px] mb-[15px] leading-[1.5] flex flex-col items-center justify-center">
              {typeof uiState.title === 'string' ? (
                <span className="whitespace-pre-wrap">{uiState.title}</span>
              ) : (
                uiState.title
              )}
            </div>
            
            <div className="w-full text-center text-[#00ffcc] font-mono text-[24px]">
              {uiState.timer}
            </div>

            {uiState.showContinue && (
              <button onClick={() => { gameState.current.isWaitingForRightEye = false; playDingSound(); setUiState(prev => ({...prev, showContinue: false})); }} className="mt-5 px-6 py-3 bg-[#00ffcc] text-[#0f141e] border-none rounded-[30px] text-[18px] font-bold cursor-pointer pointer-events-auto shadow-[0_4px_15px_rgba(0,255,204,0.4)]">▶ 準備好了，繼續訓練右眼</button>
            )}
          </div>
        </>
      )}

    </div>
  );
}

function ModuleCard({ title, desc, color, onClick }: { title: string, desc: string, color: string, onClick: () => void }) {
  return (
    <div onClick={onClick} className="bg-[#1a2233] rounded-xl p-[24px_20px] cursor-pointer w-full box-border transition-transform hover:scale-[1.01]" style={{ border: `2px solid ${color}` }}>
      <h3 className="text-[#fffdd0] text-[22px] mb-3 font-bold">{title}</h3>
      <p className="text-[#8b9bb4] text-[16px] leading-[1.6] m-0">{desc}</p>
    </div>
  );
}