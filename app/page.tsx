'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import liff from '@line/liff';
import { createClient } from '@supabase/supabase-js';
// @ts-ignore
import NoSleep from 'nosleep.js';

// ==========================================
// 1. 全域設定與 Supabase 初始化
// ==========================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bowzkrdxjfxwuxkvvlnh.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_JyPNp0UKUlSeNKMM-okN4Q_TAHuCSMT';
const supabase = createClient(supabaseUrl, supabaseKey);

const maxCycles = 3;

const focusTexts = [
  <div key="0"><span className="text-[#FF3366] font-bold">【極近對焦】</span><br/>用力看清缺口方向</div>,
  <div key="1"><span className="text-[#ff4d79] font-bold">【中近距離】</span><br/>尋找缺口位置</div>,
  <div key="2"><span className="text-[#ff668c] font-bold">【中遠距離】</span><br/>嘗試辨識缺口</div>,
  <div key="3"><span className="text-[#ff809f] font-bold">【深空極限】</span><br/>盡力即可，請放鬆不勉強</div>
];
const focusColors = [0xff3366, 0xff4d79, 0xff668c, 0xff809f];

const medicalPrinciples: Record<string, any> = {
  sop: { icon: "🚀", title: "45秒快速舒緩", color: "#FF6B6B", principle: "此模組結合了「睫狀肌放鬆」、「動態視覺刺激」與「淚膜穩定」的保健概念。<br><br>透過注視遠近變化的球體，輔助舒緩水晶體對焦壓力；最後的用力閉眼動作，可協助眼瞼板腺分泌油脂，幫助維持淚膜水分。" },
  stretch: { icon: "🔄", title: "動態 3D 眼肌伸展", color: "#4D96FF", principle: "現代人長時間凝視手機，容易導致眼周肌肉緊繃。<br><br>本模組利用最大範圍的 ∞ 字型（無限大）視覺軌跡，引導控制眼球的六條眼外肌進行大範圍活動，幫助眼周肌肉伸展與放鬆。" },
  chaser: { icon: "🎮", title: "睫狀肌深空追光", color: "#6BCB77", principle: "利用 3D 透視原理創造出「光學無限遠（Optical Infinity）」的視覺錯覺。<br><br>藉由追蹤流星飛向深空，引導視線遠眺，協助睫狀肌放鬆，作為舒緩視覺疲勞的日常輔助運動。" },
  breathe: { icon: "🌌", title: "星雲散焦與神經放鬆", color: "#FFD93D", principle: "引導您「放寬視野、不要對焦任何單顆星星」，體驗周邊視覺（Peripheral Vision）的展開。<br><br>配合深度共振呼吸法，幫助放鬆身心張力，作為舒緩日常視覺壓力的輔助。" },
  focus: { icon: "🎯", title: "Z 軸遠近對焦飛梭", color: "#FF3366", principle: "這是一款「睫狀肌的幫浦活動」。利用 Three.js 的 Z 軸深度與透視，引導睫狀肌進行看近與看遠的交替活動，作為日常維持調節靈活度的輔助練習。<br><br><strong style='color:#00ffcc;'>⏱️ 訓練時間：單眼各 60 秒，共需 2 分鐘。</strong><br><br><strong style='color:#FF3366;'>⚠️ 這是較高強度的眼球活動模組，如有不適請立即停止並讓眼睛休息。</strong>" }
};

type TestResult = 'NORMAL' | 'ABNORMAL' | null;
interface DiagnosticData { leftEye: TestResult; rightEye: TestResult; }

export default function EyeComfortApp() {
  const [currentView, setCurrentView] = useState<'DASHBOARD' | 'CALENDAR' | 'INFO_MODULES' | 'INFO_NUTRIENT' | 'INFO_RPE' | 'INFO_INTRO' | 'TRAINING' | 'TEST_REPORT'>('DASHBOARD');
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [lineProfile, setLineProfile] = useState({ uid: '未登入', name: '' });
  const [uiState, setUiState] = useState<{ title: React.ReactNode, timer: React.ReactNode, top: string, showContinue: boolean, showInput: boolean }>({ title: '', timer: '', top: '70%', showContinue: false, showInput: false });
  const [calendarData, setCalendarData] = useState<{ todayCycles: number, monthCycles: number, days: number[], today: number, year: number, month: number }>({ todayCycles: 0, monthCycles: 0, days: [], today: 1, year: 2026, month: 1 });
  const [testResults, setTestResults] = useState<DiagnosticData>({ leftEye: null, rightEye: null });

  const [trackingState, setTrackingState] = useState<'IDLE' | 'INITIALIZING' | 'TRACKING' | 'LOST' | 'NO_PERMISSION' | 'TOO_CLOSE'>('IDLE');
  
  // 新增：AI 處方強度 UI 狀態
  const [aiPrescriptionLevel, setAiPrescriptionLevel] = useState<number>(1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const faceLandmarkerRef = useRef<any>(null);
  const trackingLoopRef = useRef<any>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<any>(null); 
  const audioRef = useRef<any>({ ctx: null, bgm: null, fadeInt: null, dipTimeout: null });
  const noSleepRef = useRef<any>(null);
  
  const gameState = useRef({
    module: 'DASHBOARD', cycle: 1, phase: 'LOOKING', sopTimeLeft: 10, stretchTimeLeft: 45, chaserTimeLeft: 60, chaserScore: 0,
    breatheTimeLeft: 60, breathPhase: 'INHALE', focusTimeLeft: 120, focusStep: 0, focusDirection: 1, focusHoldTime: 3, focusCycleSpeed: 3, isWaitingForRightEye: false,
    testPhase: 'LEFT_EYE_TEST', testTimeLeft: 15, isResting: false, restTimeLeft: 0, 
    activeTimeAcc: 0, stretchAngle: 0, aiStatus: 'IDLE',
    // 專利實作：動態處方參數快取
    prescription: { level: 1, stretchSpeed: 0.6, chaserSpeed: 0.4, focusSpeed: 4.0, maxDepth: -45 } 
  });

  const startTrackingLoop = useCallback(() => {
    let lostFrames = 0;
    const track = () => {
      if (!videoRef.current || !faceLandmarkerRef.current || gameState.current.module === 'DASHBOARD') return;
      const startTimeMs = performance.now();
      
      if (videoRef.current.readyState >= 2) {
        const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
        
        let yawRatio = 1; let pitchRatio = 1; let eyeDistance = 0;

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const lm = results.faceLandmarks[0];
          const noseX = lm[1].x; const leftEyeX = lm[33].x; const rightEyeX = lm[263].x;
          const leftDist = Math.abs(noseX - leftEyeX); const rightDist = Math.abs(rightEyeX - noseX);
          yawRatio = Math.max(leftDist, rightDist) / (Math.min(leftDist, rightDist) + 0.0001);
          
          const eyeNoseY = Math.abs(lm[1].y - lm[168].y); const noseMouthY = Math.abs(lm[13].y - lm[1].y); 
          pitchRatio = Math.max(eyeNoseY, noseMouthY) / (Math.min(eyeNoseY, noseMouthY) + 0.0001);
          eyeDistance = Math.abs(leftEyeX - rightEyeX);
        }

        const currentMod = gameState.current.module;
        const currentPhase = gameState.current.phase;
        
        const isSopClosing = currentMod === 'sop' && currentPhase === 'CLOSING';
        const requiresCoveringEye = ['focus', 'amsler', 'astigmatism'].includes(currentMod);

        let isLost = false; let isTooClose = false;

        if (results.faceLandmarks.length === 0) {
            isLost = true;
        } else {
            if (!isSopClosing && !requiresCoveringEye) {
                if (yawRatio > 1.6 || pitchRatio > 1.6) isLost = true;
            }
            if (!isLost && !isSopClosing && eyeDistance > 0.30) {
                isTooClose = true;
            }
        }

        if (isSopClosing) { isLost = false; isTooClose = false; }

        if (isLost) {
          lostFrames++;
        } else {
          lostFrames = 0;
          if (isTooClose) {
            if (gameState.current.aiStatus !== 'TOO_CLOSE') { gameState.current.aiStatus = 'TOO_CLOSE'; setTrackingState('TOO_CLOSE'); }
          } else {
            if (gameState.current.aiStatus !== 'TRACKING') { gameState.current.aiStatus = 'TRACKING'; setTrackingState('TRACKING'); }
          }
        }
        
        if ((lostFrames > 3 && gameState.current.aiStatus === 'TRACKING') || (lostFrames > 3 && gameState.current.aiStatus === 'TOO_CLOSE')) {
          gameState.current.aiStatus = 'LOST'; setTrackingState('LOST');
        }
      }
      trackingLoopRef.current = setTimeout(() => { requestAnimationFrame(track); }, 100);
    };
    track();
  }, []);

  const initEyeTracking = useCallback(async () => {
    gameState.current.aiStatus = 'INIT'; setTrackingState('INITIALIZING');
    try {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
      
      if (!faceLandmarkerRef.current) {
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
          outputFaceBlendshapes: false, runningMode: "VIDEO", numFaces: 1
        });
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream; videoRef.current.play();
        videoRef.current.onloadeddata = () => { startTrackingLoop(); };
      }
    } catch (err) {
      console.error("相機存取失敗", err);
      gameState.current.aiStatus = 'NO_PERMISSION'; setTrackingState('NO_PERMISSION'); 
    }
  }, [startTrackingLoop]);

  const stopEyeTracking = useCallback(() => {
    clearTimeout(trackingLoopRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    gameState.current.aiStatus = 'IDLE'; setTrackingState('IDLE');
  }, []);

  useEffect(() => { return () => { stopEyeTracking(); }; }, [stopEyeTracking]);

  useEffect(() => {
    let NoSleepModule: any;
    import('nosleep.js').then((module) => { NoSleepModule = module.default; noSleepRef.current = new NoSleepModule(); }).catch(err => console.error(err));
    return () => { if (noSleepRef.current) noSleepRef.current.disable(); };
  }, []);

  useEffect(() => {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    audioRef.current.ctx = new AudioContext(); audioRef.current.bgm = new Audio(); audioRef.current.bgm.loop = true;
    const enableAudio = () => { if (audioRef.current.ctx?.state === 'suspended') audioRef.current.ctx.resume(); };
    window.addEventListener('click', enableAudio, { once: true }); window.addEventListener('touchstart', enableAudio, { once: true });
    return () => { window.removeEventListener('click', enableAudio); window.removeEventListener('touchstart', enableAudio); };
  }, []);

  const playDingSound = useCallback(() => {
    const ctx = audioRef.current.ctx; if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(600, ctx.currentTime);
    gain.gain.setValueAtTime(1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 1.5);
  }, []);

  const playBGM = useCallback((src: string) => {
    const { bgm } = audioRef.current; if (!bgm) return;
    clearInterval(audioRef.current.fadeInt); clearTimeout(audioRef.current.dipTimeout);
    bgm.src = src; bgm.volume = 0;
    const playPromise = bgm.play();
    if (playPromise !== undefined) playPromise.then(() => { let vol = 0; audioRef.current.fadeInt = setInterval(() => { if (vol < 0.6) { vol += 0.05; bgm.volume = Math.min(vol, 0.6); } else clearInterval(audioRef.current.fadeInt); }, 100); }).catch(() => {});
  }, []);

  const stopBGM = useCallback(() => {
    const { bgm } = audioRef.current; if (!bgm) return;
    clearInterval(audioRef.current.fadeInt); clearTimeout(audioRef.current.dipTimeout);
    let vol = bgm.volume; audioRef.current.fadeInt = setInterval(() => { if (vol > 0.05) { vol -= 0.1; bgm.volume = Math.max(vol, 0); } else { clearInterval(audioRef.current.fadeInt); bgm.pause(); bgm.currentTime = 0; } }, 100);
  }, []);

  const dipBGM = useCallback(() => {
    const { bgm } = audioRef.current; if (!bgm) return;
    clearInterval(audioRef.current.fadeInt); clearTimeout(audioRef.current.dipTimeout);
    let vol = bgm.volume; audioRef.current.fadeInt = setInterval(() => { if (vol > 0.15) { vol -= 0.05; bgm.volume = Math.max(vol, 0.15); } else { clearInterval(audioRef.current.fadeInt); audioRef.current.dipTimeout = setTimeout(() => { audioRef.current.fadeInt = setInterval(() => { if (vol < 0.6) { vol += 0.05; bgm.volume = Math.min(vol, 0.6); } else clearInterval(audioRef.current.fadeInt); }, 100); }, 3500); } }, 100);
  }, []);

  const logTraining = async (moduleName: string, durationSec: number) => { if (!lineProfile.uid || lineProfile.uid === '未登入') return; try { await supabase.from('training_logs').insert([{ line_uid: lineProfile.uid, module_name: moduleName, duration: durationSec }]); } catch (err) {} };
  const getTodayString = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const recordModuleCompletion = (type: string) => {
    if (!['sop', 'stretch', 'chaser', 'breathe', 'focus', 'amsler', 'astigmatism'].includes(type)) return;
    const today = getTodayString(); const modulesKey = `rehab_modules_${today}`; const cyclesKey = `rehab_cycles_${today}`;
    let modulesDone = JSON.parse(localStorage.getItem(modulesKey) || '[]'); let cycles = parseInt(localStorage.getItem(cyclesKey) || '0', 10);
    if (!modulesDone.includes(type)) modulesDone.push(type);
    if (modulesDone.length >= 4) { cycles++; localStorage.setItem(cyclesKey, cycles.toString()); localStorage.setItem(modulesKey, JSON.stringify([])); } 
    else { localStorage.setItem(modulesKey, JSON.stringify(modulesDone)); }
    loadCalendarData();
  };

  const loadCalendarData = useCallback(() => {
    const d = new Date(); const year = d.getFullYear(); const month = d.getMonth(); const todayDate = d.getDate();
    const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate();
    let monthCycles = 0; const days = Array(firstDay).fill(-1); 
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const cycles = parseInt(localStorage.getItem(`rehab_cycles_${dateStr}`) || '0', 10);
      monthCycles += cycles; days.push(cycles);
    }
    const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;
    const todayCycles = parseInt(localStorage.getItem(`rehab_cycles_${todayStr}`) || '0', 10);
    setCalendarData({ todayCycles, monthCycles, days, today: todayDate, year, month });

    // 專利實作：依據月循環次數，動態自適應更新 AI 處方參數
    let newPrescription = { level: 1, stretchSpeed: 0.6, chaserSpeed: 0.4, focusSpeed: 4.0, maxDepth: -45 };
    if (monthCycles >= 3) {
      newPrescription = { level: 2, stretchSpeed: 1.0, chaserSpeed: 0.6, focusSpeed: 3.0, maxDepth: -60 };
    }
    if (monthCycles >= 7) {
      newPrescription = { level: 3, stretchSpeed: 1.3, chaserSpeed: 0.8, focusSpeed: 2.0, maxDepth: -75 };
    }
    gameState.current.prescription = newPrescription;
    setAiPrescriptionLevel(newPrescription.level);

  }, []);

  const handleShareCalendar = async () => {
    const name = lineProfile.name || '我';
    const textToShare = `👁️ Aura EyeGym 視覺復健打卡！\n${name}今天已經完成 ${calendarData.todayCycles} 次完整的眼部復健運動，這個月已經完成 ${calendarData.monthCycles} 次眼部復健大循環。跟我一起保護眼睛吧！\n✨ 請搭配醫師推薦營養配方，補充眼睛關鍵營養！\n👉 https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID || '2011063080-EDRCTHXv'}`;

    const fallbackCopy = () => {
      try {
        const textArea = document.createElement("textarea"); textArea.value = textToShare;
        textArea.style.top = "0"; textArea.style.left = "0"; textArea.style.position = "fixed";
        document.body.appendChild(textArea); textArea.focus(); textArea.select();
        document.execCommand("copy"); document.body.removeChild(textArea);
        alert("✅ 已成功複製專屬打卡紀錄！\n請直接貼上分享給您的好友或群組。");
      } catch (err) { alert("複製失敗，請手動截圖分享。"); }
    };

    try {
      if (liff.isLoggedIn() && liff.isApiAvailable('shareTargetPicker')) {
        const res = await liff.shareTargetPicker([{ type: "text", text: textToShare }]);
        if (res) return; 
      }
      if (navigator.share) { await navigator.share({ title: 'Aura EyeGym 視覺復健打卡', text: textToShare }); return; }
      fallbackCopy();
    } catch (e) { fallbackCopy(); }
  };

  useEffect(() => {
    const initLiff = async () => { try { await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID || '' }); if (liff.isLoggedIn()) { const profile = await liff.getProfile(); setLineProfile({ uid: profile.userId, name: profile.displayName }); } } catch (err) {} };
    initLiff(); loadCalendarData();
  }, [loadCalendarData]);

  // ==========================================
  // Three.js 引擎與動畫 (接收動態處方參數)
  // ==========================================
  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0f141e);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.z = 5;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setSize(window.innerWidth, window.innerHeight);
    canvasRef.current.appendChild(renderer.domElement); scene.add(new THREE.AmbientLight(0xfffdd0, 0.6));

    const sopGroup = new THREE.Group(); sopGroup.position.y = 12;
    const sopMat = new THREE.MeshStandardMaterial({ color: 0x6b8e23, emissive: 0x2e4b1c, wireframe: true, transparent: true });
    const focusTarget = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 32), sopMat);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true });
    focusTarget.add(new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), coreMat)); sopGroup.add(focusTarget); scene.add(sopGroup);

    const stretchGroup = new THREE.Group();
    const stretchOrb = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 32), new THREE.MeshBasicMaterial({ color: 0xff9900 }));
    stretchOrb.add(new THREE.PointLight(0xffaa00, 2.5, 60)); stretchGroup.add(stretchOrb); scene.add(stretchGroup);

    const chaserGroup = new THREE.Group();
    const chaserOrb = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true }));
    chaserOrb.add(new THREE.PointLight(0xffd700, 2.5, 80)); chaserGroup.add(chaserOrb); scene.add(chaserGroup);

    const breatheGroup = new THREE.Group();
    const particleCount = 2000; const particlesGeo = new THREE.BufferGeometry(); const posArray = new Float32Array(particleCount * 3);
    for(let i = 0; i < particleCount * 3; i++) posArray[i] = (Math.random() - 0.5) * 60;
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMat = new THREE.PointsMaterial({ size: 0.15, color: 0x00ffcc, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    const particleSystem = new THREE.Points(particlesGeo, particlesMat); breatheGroup.add(particleSystem); breatheGroup.position.z = -20; scene.add(breatheGroup);

    const focusGroup = new THREE.Group();
    const focusRing = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.8, 32, 1, 0, Math.PI * 1.7), new THREE.MeshBasicMaterial({ color: 0xff3366, side: THREE.DoubleSide, transparent: true }));
    focusGroup.add(focusRing); scene.add(focusGroup);

    const amslerGroup = new THREE.Group();
    const gridHelper = new THREE.GridHelper(30, 30, 0x557799, 0x445566); gridHelper.rotation.x = Math.PI / 2; gridHelper.position.z = -15; amslerGroup.add(gridHelper);
    const centerDot = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffffff })); centerDot.position.z = -14.9; amslerGroup.add(centerDot); scene.add(amslerGroup);

    const astigGroup = new THREE.Group();
    for (let i = 0; i < 12; i++) { const line = new THREE.Mesh(new THREE.PlaneGeometry(25, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff })); line.rotation.z = (i * Math.PI) / 12; astigGroup.add(line); }
    const astigCenterDot = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ color: 0xff3333 })); astigCenterDot.position.z = 0.1; astigGroup.add(astigCenterDot); astigGroup.position.z = -25; scene.add(astigGroup);

    const allModules = [sopGroup, stretchGroup, chaserGroup, breatheGroup, focusGroup, amslerGroup, astigGroup]; allModules.forEach((m: any) => m.visible = false);
    const stimulusBalls: any[] = [];

    engineRef.current = {
      start: (mod: string) => {
        allModules.forEach((m: any) => m.visible = false);
        if (mod === 'sop') { sopGroup.visible = true; sopMat.opacity = 1; coreMat.opacity = 1; }
        if (mod === 'stretch') { stretchGroup.visible = true; stretchOrb.position.set(0,0,-30); }
        if (mod === 'chaser') { chaserGroup.visible = true; breatheGroup.visible = true; chaserOrb.position.set((Math.random()-0.5)*20, (Math.random()-0.5)*15, -10); chaserOrb.scale.setScalar(1); chaserOrb.material.opacity = 1; }
        if (mod === 'breathe') { breatheGroup.visible = true; }
        // 使用動態處方深度
        if (mod === 'focus') { focusGroup.visible = true; focusGroup.position.z = focusDepths[0]; focusRing.material.color.setHex(focusColors[0]); }
        if (mod === 'amsler') { amslerGroup.visible = true; }
        if (mod === 'astigmatism') { astigGroup.visible = true; }
      },
      spawnBall: () => {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), new THREE.MeshBasicMaterial({ color: 0xf5f5dc, transparent: true, opacity: 0.8, depthWrite: false }));
        ball.position.set((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, -70); sopGroup.add(ball); stimulusBalls.push(ball);
      },
      updateFocusRing: (step: number) => { focusRing.material.color.setHex(focusColors[step]); focusRing.rotation.z = Math.floor(Math.random() * 4) * (Math.PI / 2); },
      stop: () => { allModules.forEach((m: any) => m.visible = false); stimulusBalls.forEach((b: any) => { if(b.parent) b.parent.remove(b); b.geometry.dispose(); b.material.dispose(); }); stimulusBalls.length = 0; }
    };

    let animationFrameId: number;
    let lastRenderTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const mod = gameState.current.module;
      if (mod === 'DASHBOARD') { renderer.render(new THREE.Scene(), camera); return; }

      const now = performance.now();
      const requiresTracking = ['stretch', 'chaser', 'breathe', 'focus'].includes(mod) || (mod === 'sop' && gameState.current.phase === 'LOOKING');
      const currentAiStatus = gameState.current.aiStatus;
      
      if (requiresTracking && (currentAiStatus === 'INIT' || ((currentAiStatus === 'LOST' || currentAiStatus === 'TOO_CLOSE') && !gameState.current.isResting && gameState.current.phase !== 'COMPLETED'))) { 
        lastRenderTime = now;
        renderer.render(scene, camera); return; 
      }

      const delta = Math.min(now - lastRenderTime, 40);
      lastRenderTime = now;
      gameState.current.activeTimeAcc += delta;
      
      const timeDelta = gameState.current.activeTimeAcc * 0.0012;
      
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
        // 套用動態處方：stretchSpeed
        gameState.current.stretchAngle += (0.025 * gameState.current.prescription.stretchSpeed); 
        const speed = gameState.current.stretchAngle; 
        stretchOrb.scale.setScalar(1 + Math.cos(speed * 3) * 0.1);
        
        const currentZ = -30 + Math.sin(speed * 0.5) * 20;
        const distToCamera = camera.position.z - currentZ;
        const vFovRad = (camera.fov * Math.PI) / 180;
        const visibleHeight = 2 * Math.tan(vFovRad / 2) * distToCamera;
        const visibleWidth = visibleHeight * camera.aspect;
        
        const edgeX = visibleWidth / 2; const edgeY = visibleHeight / 2;
        const ampX = edgeX - 0.5; const ampY = Math.min(edgeY * 0.6, 12); 
        stretchOrb.position.set(Math.sin(speed) * ampX, Math.sin(speed * 2) * ampY, currentZ);
      }
      
      if (mod === 'breathe' || mod === 'chaser') { particleSystem.rotation.y += 0.0005; particleSystem.rotation.z += 0.0002; }
      if (mod === 'chaser' && gameState.current.chaserTimeLeft > 0) {
        // 套用動態處方：chaserSpeed
        chaserOrb.position.z -= gameState.current.prescription.chaserSpeed;
        if (chaserOrb.position.z < -120) { 
          gameState.current.chaserScore++; playDingSound(); 
          chaserOrb.position.set((Math.random()-0.5)*20, (Math.random()-0.5)*15, -10); chaserOrb.scale.setScalar(1); chaserOrb.material.opacity = 1;
        } else {
          const progress = (chaserOrb.position.z + 10) / -110;
          const currentScale = Math.max(0, 1 - progress * 0.9); chaserOrb.scale.setScalar(currentScale); chaserOrb.material.opacity = 1 - Math.pow(progress, 3);
        }
      }
      if (mod === 'breathe' && gameState.current.breatheTimeLeft > 0) {
        const breathCycle = Math.sin((gameState.current.activeTimeAcc % 10000) / 10000 * Math.PI * 2);
        const currentScale = 1.05 + breathCycle * 0.25; particleSystem.scale.setScalar(currentScale); particlesMat.color.setHSL(0.5 + breathCycle * 0.1, 0.8, 0.4 + breathCycle * 0.2);
      }
      if (mod === 'focus' && gameState.current.focusTimeLeft > 0) {
        // 套用動態處方：maxDepth
        const dynamicFocusDepths = [-1, -15, -35, gameState.current.prescription.maxDepth];
        focusGroup.position.z += (dynamicFocusDepths[gameState.current.focusStep] - focusGroup.position.z) * 0.15;
      }
      renderer.render(scene, camera);
    };
    animate();
    const handleResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); cancelAnimationFrame(animationFrameId); if (canvasRef.current) canvasRef.current.removeChild(renderer.domElement); renderer.dispose(); };
  }, [playDingSound]); 

  // ==========================================
  // 計時器邏輯
  // ==========================================
  const updateUI = useCallback(() => {
    const state = gameState.current;
    
    const completionReminder = (
      <div className="text-[17px] text-[#E5B55E] mt-4 leading-[1.6] px-4">
        💡 溫馨提醒：訓練時為達最佳視覺張力可靠近至 20 公分，<br/>但日常滑手機請務必保持 <span className="text-[#00ffcc] font-bold">30~40 公分</span> 距離喔！
      </div>
    );

    if (state.module === 'sop') {
      if (state.phase === 'COMPLETED') setUiState({ top: '35%', title: "🎉 3 回合深層放鬆完成！", timer: completionReminder, showContinue: false, showInput: false });
      else if (state.phase === 'LOOKING') setUiState({ top: '70%', title: <div className="text-center w-full">{`(第 ${state.cycle}/${maxCycles} 回合)`}<br/>請柔和注視中心橘點</div>, timer: `剩餘 ${state.sopTimeLeft} 秒`, showContinue: false, showInput: false });
      else if (state.phase === 'CLOSING') setUiState({ top: '70%', title: "請用力閉上雙眼，徹底放鬆", timer: `剩餘 ${state.sopTimeLeft} 秒`, showContinue: false, showInput: false });
    } else if (state.module === 'stretch') {
      if (state.stretchTimeLeft > 0) setUiState({ top: '80%', title: <div className="text-center w-full">保持頭部靜止<br/>跟隨光球移動伸展眼肌</div>, timer: `剩餘 ${state.stretchTimeLeft} 秒`, showContinue: false, showInput: false });
      else if (state.isResting) setUiState({ top: '50%', title: "請閉眼休息5秒鐘", timer: `休息 ${state.restTimeLeft} 秒`, showContinue: false, showInput: false });
      else setUiState({ top: '50%', title: "🎉 眼肌與焦距重訓完成！", timer: completionReminder, showContinue: false, showInput: false });
    } else if (state.module === 'chaser') {
      if (state.chaserTimeLeft > 0) setUiState({ top: '80%', title: <div className="text-center w-full">【睫狀肌深空追光】<br/>死盯流星飛向最深處直到消失<br/>(已追蹤: {state.chaserScore} 顆)</div>, timer: `遊戲剩餘：${state.chaserTimeLeft} 秒`, showContinue: false, showInput: false });
      else if (state.isResting) setUiState({ top: '50%', title: "請閉眼休息5秒鐘", timer: `休息 ${state.restTimeLeft} 秒`, showContinue: false, showInput: false });
      else setUiState({ top: '50%', title: <div className="text-center w-full">🎮 遊戲結束！<br/>您成功追蹤了 {state.chaserScore} 顆深空流星</div>, timer: completionReminder, showContinue: false, showInput: false });
    } else if (state.module === 'breathe') {
      if (state.breatheTimeLeft > 0) {
        const action = state.breathPhase === 'INHALE' ? "跟隨星雲【緩慢吸氣】" : "跟隨星雲【徹底吐氣】";
        setUiState({ top: '85%', title: <div className="text-center w-full">{action}<br/>(請不要對焦任何星星，放寬視野)</div>, timer: `深度放鬆中：${state.breatheTimeLeft} 秒`, showContinue: false, showInput: false });
      } else if (state.isResting) setUiState({ top: '50%', title: "請閉眼休息5秒鐘", timer: `休息 ${state.restTimeLeft} 秒`, showContinue: false, showInput: false });
      else setUiState({ top: '50%', title: "🌌 視覺神經與自律神經已深度重置", timer: completionReminder, showContinue: false, showInput: false });
    } else if (state.module === 'focus') {
      if (state.isWaitingForRightEye) setUiState({ top: '70%', title: <div className="text-center w-full text-[#00ffcc] mb-2">👁️ 左眼訓練完成！<br/>請換遮左眼，準備進行【右眼】重訓</div>, timer: '', showContinue: true, showInput: false });
      else if (state.focusTimeLeft > 0) {
        const eye = state.focusTimeLeft > 60 ? "👁️ 請遮住右眼，訓練【左眼】" : "👁️ 換遮左眼，訓練【右眼】";
        setUiState({ top: '85%', title: <div className="w-full flex flex-col items-center justify-center text-center"><div className="text-[#00ffcc] mb-3">{eye}</div>{focusTexts[state.focusStep]}</div>, timer: `重訓剩餘：${state.focusTimeLeft} 秒`, showContinue: false, showInput: false });
      } else if (state.isResting) setUiState({ top: '50%', title: "請閉眼休息5秒鐘", timer: `休息 ${state.restTimeLeft} 秒`, showContinue: false, showInput: false });
      else setUiState({ top: '45%', title: <div className="w-full text-center flex flex-col items-center">🎯 睫狀肌幫浦重訓完成！<br/><br/><span className="text-[18px] text-[#FFD93D]">⚠️ 提醒您：如果覺得眼睛累了請適當休息，<br/>建議接著進行前四個眼睛放鬆模組。</span></div>, timer: completionReminder, showContinue: false, showInput: false });
    } else if (state.module === 'amsler' || state.module === 'astigmatism') {
      if (state.testPhase === 'LEFT_EYE_TEST' || state.testPhase === 'RIGHT_EYE_TEST') {
        const eye = state.testPhase === 'LEFT_EYE_TEST' ? "左眼" : "右眼"; const cover = state.testPhase === 'LEFT_EYE_TEST' ? "右眼" : "左眼";
        const desc = state.module === 'amsler' ? "(觀察周圍網格是否扭曲或有黑影)" : "(觀察線條是否有些特別黑粗、或模糊發淡？)";
        setUiState({ top: '80%', title: <div className="text-center w-full">【檢測{eye}】請遮住{cover}，注視中心<br/>{desc}</div>, timer: `檢測中：${state.testTimeLeft} 秒`, showContinue: false, showInput: false });
      } else if (state.testPhase === 'LEFT_EYE_INPUT' || state.testPhase === 'RIGHT_EYE_INPUT') {
        const eye = state.testPhase === 'LEFT_EYE_INPUT' ? "左眼" : "右眼";
        setUiState({ top: '75%', title: <div className="text-center w-full text-[#FFD93D]">請回報您【{eye}】的視覺感受</div>, timer: '', showContinue: false, showInput: true });
      }
    }
  }, []);

  const handleDiagnosticInput = (result: TestResult) => {
    const state = gameState.current;
    if (state.testPhase === 'LEFT_EYE_INPUT') { setTestResults(prev => ({ ...prev, leftEye: result })); state.testPhase = 'RIGHT_EYE_TEST'; state.testTimeLeft = 15; playDingSound(); } 
    else if (state.testPhase === 'RIGHT_EYE_INPUT') { setTestResults(prev => ({ ...prev, rightEye: result })); playDingSound(); recordModuleCompletion(state.module); logTraining(state.module === 'amsler' ? '黃斑部數位評估' : '散光軸向數位評估', 30); setCurrentView('TEST_REPORT'); }
    updateUI();
  };

  useEffect(() => {
    const timerId = setInterval(() => {
      const state = gameState.current;
      if (state.module === 'DASHBOARD' || currentView === 'TEST_REPORT') return;

      const requiresTracking = ['stretch', 'chaser', 'breathe', 'focus'].includes(state.module) || (state.module === 'sop' && state.phase === 'LOOKING');
      
      if (requiresTracking) {
        if (state.aiStatus === 'INIT') return;
        if ((state.aiStatus === 'LOST' || state.aiStatus === 'TOO_CLOSE') && !state.isResting && state.phase !== 'COMPLETED') return;
      }

      if (requiresTracking && state.isResting) {
        state.restTimeLeft--; if (state.restTimeLeft <= 0) { state.isResting = false; playDingSound(); }
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
        state.stretchTimeLeft--; if (state.stretchTimeLeft <= 0) { state.isResting = true; state.restTimeLeft = 5; dipBGM(); playDingSound(); recordModuleCompletion('stretch'); logTraining('動態 3D 眼肌伸展', 45); }
      } else if (state.module === 'chaser') {
        if (state.chaserTimeLeft <= 0) return;
        state.chaserTimeLeft--; if (state.chaserTimeLeft <= 0) { state.isResting = true; state.restTimeLeft = 5; dipBGM(); playDingSound(); recordModuleCompletion('chaser'); logTraining('睫狀肌深空追光', 60); }
      } else if (state.module === 'breathe') {
        if (state.breatheTimeLeft <= 0) return;
        state.breatheTimeLeft--;
        if (state.breatheTimeLeft > 0) {
          if (state.breatheTimeLeft % 10 === 5) { state.breathPhase = 'INHALE'; playDingSound(); }
          else if (state.breatheTimeLeft % 10 === 0) { state.breathPhase = 'EXHALE'; playDingSound(); }
        } else { state.isResting = true; state.restTimeLeft = 5; dipBGM(); playDingSound(); recordModuleCompletion('breathe'); logTraining('星雲散焦與神經放鬆', 60); }
      } else if (state.module === 'focus') {
        if (state.isWaitingForRightEye || state.focusTimeLeft <= 0) return;
        state.focusTimeLeft--; state.focusHoldTime--;
        
        // 套用動態處方：動態更新對焦循環速度
        const currentAiSpeed = state.prescription.focusSpeed;
        if (state.focusTimeLeft === 90) state.focusCycleSpeed = currentAiSpeed * 0.75;
        if (state.focusTimeLeft === 75) state.focusCycleSpeed = currentAiSpeed * 0.5;
        if (state.focusTimeLeft === 60) { playDingSound(); state.focusCycleSpeed = currentAiSpeed; state.isWaitingForRightEye = true; }
        if (state.focusTimeLeft === 30) state.focusCycleSpeed = currentAiSpeed * 0.75;
        if (state.focusTimeLeft === 15) state.focusCycleSpeed = currentAiSpeed * 0.5;
        
        if (state.focusHoldTime <= 0 && state.focusTimeLeft > 0) {
          state.focusStep += state.focusDirection;
          if (state.focusStep >= 3) { state.focusStep = 3; state.focusDirection = -1; }
          else if (state.focusStep <= 0) { state.focusStep = 0; state.focusDirection = 1; }
          state.focusHoldTime = state.focusCycleSpeed; engineRef.current?.updateFocusRing(state.focusStep);
        }
        if (state.focusTimeLeft <= 0) { state.isResting = true; state.restTimeLeft = 5; dipBGM(); playDingSound(); recordModuleCompletion('focus'); logTraining('Z 軸遠近對焦飛梭', 120); }
      } else if (state.module === 'amsler' || state.module === 'astigmatism') {
        if (state.testPhase === 'LEFT_EYE_TEST' || state.testPhase === 'RIGHT_EYE_TEST') {
          state.testTimeLeft--;
          if (state.testTimeLeft <= 0) { state.testPhase = state.testPhase === 'LEFT_EYE_TEST' ? 'LEFT_EYE_INPUT' : 'RIGHT_EYE_INPUT'; playDingSound(); }
        }
      }
      updateUI();
    }, 1000);
    return () => clearInterval(timerId);
  }, [playDingSound, dipBGM, updateUI, logTraining, currentView]);

  // ==========================================
  // 視圖切換與按鈕處理
  // ==========================================
  const startTraining = (type: string) => {
    if (audioRef.current.ctx?.state === 'suspended') { audioRef.current.ctx.resume(); }

    setActiveModule(type); setCurrentView('TRAINING');
    const state = gameState.current;
    
    state.module = type; 
    state.phase = 'LOOKING'; 
    state.isResting = false; 
    state.restTimeLeft = 0; 
    state.activeTimeAcc = 0;
    state.stretchAngle = 0;
    
    // 初始化套用處方強度
    state.focusCycleSpeed = state.prescription.focusSpeed;
    state.focusHoldTime = state.prescription.focusSpeed;

    if (noSleepRef.current) noSleepRef.current.enable();

    if (['sop', 'stretch', 'chaser', 'breathe', 'focus', 'amsler', 'astigmatism'].includes(type)) {
      gameState.current.aiStatus = 'INIT'; 
      setTrackingState('INITIALIZING');
      initEyeTracking(); 
    }
    
    if (type === 'sop') { state.cycle = 1; state.sopTimeLeft = 10; playBGM('/game1.mp3'); }
    else if (type === 'stretch') { state.stretchTimeLeft = 45; playBGM('/game2.mp3'); }
    else if (type === 'chaser') { state.chaserTimeLeft = 60; state.chaserScore = 0; playBGM('/game3.mp3'); }
    else if (type === 'breathe') { state.breatheTimeLeft = 60; state.breathPhase = 'INHALE'; playBGM('/game4.mp3'); }
    else if (type === 'focus') { state.focusTimeLeft = 120; state.focusStep = 0; state.focusDirection = 1; state.isWaitingForRightEye = false; playBGM('/game5.mp3'); }
    else if (type === 'amsler' || type === 'astigmatism') { state.testPhase = 'LEFT_EYE_TEST'; state.testTimeLeft = 15; setTestResults({ leftEye: null, rightEye: null }); }
    
    engineRef.current?.start(type); updateUI();
  };

  const returnToDashboard = () => {
    if (['sop', 'stretch', 'chaser', 'breathe', 'focus', 'amsler', 'astigmatism'].includes(gameState.current.module)) { stopBGM(); stopEyeTracking(); }
    gameState.current.module = 'DASHBOARD'; 
    engineRef.current?.stop();
    if (noSleepRef.current) noSleepRef.current.disable();
    setCurrentView('DASHBOARD'); setActiveModule(null);
  };

  const showModuleIntro = (type: string) => { setActiveModule(type); setCurrentView('INFO_INTRO'); };

  // ==========================================
  // React JSX 渲染樹
  // ==========================================
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0f141e] font-sans">
      <div ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* 視圖 1: 大廳 (DASHBOARD) */}
      {currentView === 'DASHBOARD' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-start py-10 px-5 overflow-y-auto box-border">
          <h1 className="text-[#fffdd0] text-[32px] text-center mb-[15px] tracking-[1px]"><div className="text-[55px] mb-[10px]">👁️</div>Aura EyeGym</h1>
          <p className="text-[#00ffcc] text-[16px] mt-[-10px] mb-[15px]">數位視覺復健中心</p>
          <p className={`text-[20px] text-center leading-[1.5] mb-[20px] break-keep ${lineProfile.uid !== '未登入' ? 'text-[#00ffcc]' : 'text-[#8b9bb4]'}`}>
            {lineProfile.uid !== '未登入' ? `歡迎回來，${lineProfile.name}！請選擇您的專屬放鬆模組` : (
              <>請選擇您的專屬眼部放鬆與訓練模組<br /><button onClick={() => liff.login({ redirectUri: window.location.href })} className="mt-[15px] px-6 py-2.5 bg-[#06C755] text-white border-none rounded-full text-[18px] font-bold cursor-pointer shadow-[0_4px_10px_rgba(6,199,85,0.3)]">🟢 使用 LINE 一鍵登入</button></>
            )}
          </p>

          {/* 專利實作：動態 AI 處方展示 UI */}
          <div className="bg-[#162b2b] border border-[#00ffcc] rounded-lg p-3 mb-[30px] w-full max-w-[800px] text-center shadow-[0_0_10px_rgba(0,255,204,0.2)]">
            <p className="text-[#00ffcc] text-[14px] m-0 mb-1">🤖 邊緣運算自適應引擎啟動中</p>
            <p className="text-[#fffdd0] text-[16px] m-0 font-bold">為您生成的動態數位處方：強度 Level {aiPrescriptionLevel}</p>
          </div>

          <div className="w-full max-w-[800px] flex flex-col gap-5 mb-[40px]">
            <div onClick={() => setCurrentView('INFO_MODULES')} className="w-full bg-[#1a2233] border-2 border-[#E5B55E] rounded-xl p-5 cursor-pointer shadow-[0_0_15px_rgba(229,181,94,0.2)] text-center transition-all duration-200 hover:scale-[1.02]">
              <h3 className="text-[#E5B55E] text-[22px] mb-2 font-bold">📖 數位復健模組與醫學學理說明</h3>
              <p className="text-[#8b9bb4] text-[16px] m-0">點擊了解本中心五大訓練模組之設計原理與學術文獻探討</p>
            </div>
            
            <div onClick={() => setCurrentView('CALENDAR')} className="w-full bg-[#161b22] border-2 border-[#4D96FF] rounded-xl p-5 cursor-pointer shadow-[0_0_15px_rgba(77,150,255,0.2)] text-center transition-all duration-200 hover:scale-[1.02]">
              <h3 className="text-[#4D96FF] text-[22px] mb-2 font-bold">📅 每日/每月復健進度</h3>
              <p className="text-[#8b9bb4] text-[16px] m-0">點擊查看您的打卡紀錄，分享給家人與醫師</p>
            </div>
            
            <div className="flex flex-col gap-5 w-full">
              <ModuleCard title="🚀 45秒快速舒緩" desc="結合遠眺聚焦、隨機白球衝擊與深層閉眼潤滑。" color="#FF6B6B" onClick={() => showModuleIntro('sop')} />
              <ModuleCard title="🔄 動態 3D 眼肌伸展" desc="引導眼球進行 ∞ 字型極限軌跡，強迫拉伸控制眼球的六條眼外肌。" color="#4D96FF" onClick={() => showModuleIntro('stretch')} />
              <ModuleCard title="🎮 睫狀肌深空追光" desc="【放鬆遊戲】死盯流星飛向深空，強迫睫狀肌徹底看遠放鬆。" color="#6BCB77" onClick={() => showModuleIntro('chaser')} />
              <ModuleCard title="🌌 星雲散焦與神經放鬆" desc="【深度冥想】釋放隧道視覺，同步 3D 粒子星雲進行共振呼吸。" color="#FFD93D" onClick={() => showModuleIntro('breathe')} />
              <ModuleCard title="🎯 Z 軸遠近對焦飛梭" desc="高強度睫狀肌重訓！利用極端遠近切換，恢復眼球對焦彈性。" color="#FF3366" onClick={() => showModuleIntro('focus')} />
              <ModuleCard title="🔍 互動式黃斑部評估" desc="專利級數位化阿姆斯勒方格表，包含左右眼自適應風險運算。" color="#9D4EDD" onClick={() => startTraining('amsler')} />
              <ModuleCard title="👁️ 互動式散光軸向評估" desc="專利級數位化放射鐘測試，分析潛在散光導致之視覺疲勞。" color="#FF9F1C" onClick={() => startTraining('astigmatism')} />
            </div>

            <div onClick={() => setCurrentView('INFO_NUTRIENT')} className="w-full bg-[#162b2b] border-2 border-[#00ffcc] rounded-xl p-5 cursor-pointer shadow-[0_0_15px_rgba(0,255,204,0.2)] text-center transition-all duration-200 hover:scale-[1.02] mt-2">
              <h3 className="text-[#00ffcc] text-[22px] mb-2 font-bold">🔬 旗艦護眼營養百科</h3>
              <p className="text-[#8b9bb4] text-[16px] m-0">點擊了解針對不同眼睛部位結構的專屬營養配方解析</p>
            </div>
          </div>
        </div>
      )}

      {/* 視圖 2, 2.5, 3, 4, 5: 衛教與介紹頁面 */}
      {currentView === 'INFO_NUTRIENT' && (
        <div className="absolute inset-0 z-50 bg-[#0f141e] overflow-y-auto p-5 box-border">
          <div className="max-w-[800px] mx-auto pb-[50px]">
            <button onClick={() => setCurrentView('DASHBOARD')} className="px-6 py-3 bg-[#1a2233] text-[#fffdd0] border border-[#2a3a5a] rounded-lg mb-5 cursor-pointer text-[18px] font-bold shadow-lg">🔙 返回大廳</button>
            <h2 className="text-[#fffdd0] text-[28px] border-b-2 border-[#00ffcc] pb-2.5 mb-[15px] font-bold">🔬 旗艦護眼營養部位百科</h2>
            <div className="mb-6 bg-[#1f1616] p-5 rounded-lg border border-[#ff4d4d] shadow-[0_0_10px_rgba(255,77,77,0.2)]">
              <h3 className="text-[#ff4d4d] text-[20px] font-bold mb-3 flex items-center gap-2"><span>⚠️</span> 醫療法規與免責聲明</h3>
              <p className="text-[#d1b0b0] text-[16px] leading-[1.8] m-0">本頁面提供之營養素資訊僅供日常生理保健與學理參考，<strong>不代表任何產品具備診斷、治療或預防眼科疾病之療效</strong>。營養素通常是維持組織正常功能或降低缺乏風險，不能取代眼科檢查與治療。</p>
            </div>
            <p className="text-[#8b9bb4] text-[17px] leading-[1.6] mb-5 bg-[#162b2b] p-4 rounded-lg"><strong className="text-[#00ffcc]">閱讀重點｜</strong>眼睛是非常精密的器官，不同的解剖構造需要對應不同的關鍵營養素。單一成分無法顧及全眼健康，以下為具備醫學學理支持的營養素對應表：</p>
            <button onClick={() => setCurrentView('INFO_RPE')} className="w-full py-4 mb-6 bg-[#2B579A] text-white border-none rounded-xl text-[20px] font-bold cursor-pointer shadow-[0_4px_15px_rgba(43,87,154,0.4)] transition-transform hover:scale-[1.02]">
              👉 深度解析：為什麼視網膜色素上皮 (RPE) 很重要？
            </button>
            <div className="overflow-x-auto mb-[30px] rounded-lg shadow-lg">
              <table className="w-full min-w-[600px] border-collapse text-[#fffdd0] text-[15px] leading-[1.6]">
                <thead><tr className="bg-[#1a2233] text-left"><th className="p-3 border border-[#2a3a5a] w-[25%]">關鍵營養素</th><th className="p-3 border border-[#2a3a5a] w-[25%]">主要作用部位</th><th className="p-3 border border-[#2a3a5a] w-[50%]">學理與功能性參考</th></tr></thead>
                <tbody>
                  <tr className="bg-[#121824]"><td className="p-3 border border-[#2a3a5a] text-[#00ffcc] font-bold">葉黃素、玉米黃素</td><td className="p-3 border border-[#2a3a5a]">視網膜黃斑部、中央凹</td><td className="p-3 border border-[#2a3a5a]">構成黃斑色素，與中央視力、辨色及對比敏感度有關；是最直接對應黃斑部的營養素。</td></tr>
                  <tr className="bg-[#162b2b]"><td className="p-3 border border-[#2a3a5a] text-[#00ffcc] font-bold">Propolins<br/>(尤其 Propolin G)</td><td className="p-3 border border-[#2a3a5a]">視網膜色素上皮 (RPE)；黃斑部外層</td><td className="p-3 border border-[#2a3a5a]">細胞實驗顯示可提高氧化或缺氧損傷下的存活；動物模型中顯示 RPE 功能改善。目前屬細胞與動物前臨床證據。</td></tr>
                  <tr className="bg-[#121824]"><td className="p-3 border border-[#2a3a5a] text-[#00ffcc] font-bold">維生素A、β-胡蘿蔔素</td><td className="p-3 border border-[#2a3a5a]">視網膜桿狀細胞；角膜、結膜</td><td className="p-3 border border-[#2a3a5a]">參與視紫質形成並維持眼表上皮；缺乏時可能導致乾眼與角膜損傷。</td></tr>
                  <tr className="bg-[#162b2b]"><td className="p-3 border border-[#2a3a5a] text-[#00ffcc] font-bold">DHA</td><td className="p-3 border border-[#2a3a5a]">視網膜感光細胞</td><td className="p-3 border border-[#2a3a5a]">感光細胞膜的重要結構成分，在視網膜含量很高。</td></tr>
                  <tr className="bg-[#121824]"><td className="p-3 border border-[#2a3a5a] text-[#00ffcc] font-bold">Omega-3<br/>(EPA、DHA)</td><td className="p-3 border border-[#2a3a5a]">淚膜、瞼板腺、眼表</td><td className="p-3 border border-[#2a3a5a]">可能影響發炎與淚膜油脂層；但大型研究中對中重度乾眼的改善未顯著優於安慰劑。</td></tr>
                  <tr className="bg-[#162b2b]"><td className="p-3 border border-[#2a3a5a] text-[#00ffcc] font-bold">維生素C、維生素E</td><td className="p-3 border border-[#2a3a5a]">水晶體、視網膜</td><td className="p-3 border border-[#2a3a5a]">屬抗氧化營養素；與其他成分組成 AREDS2 時可延緩特定 AMD 惡化。</td></tr>
                  <tr className="bg-[#121824]"><td className="p-3 border border-[#2a3a5a] text-[#00ffcc] font-bold">鋅 (Zinc)</td><td className="p-3 border border-[#2a3a5a]">視網膜、黃斑部</td><td className="p-3 border border-[#2a3a5a]">視網膜含有較高濃度的鋅；在完整 AREDS2 配方中，可協助延緩特定程度 AMD 惡化。</td></tr>
                  <tr className="bg-[#162b2b]"><td className="p-3 border border-[#2a3a5a] text-[#00ffcc] font-bold">銅 (Copper)</td><td className="p-3 border border-[#2a3a5a]">無特定單一結構</td><td className="p-3 border border-[#2a3a5a]">加入配方主要目的是防止長期高劑量鋅造成銅缺乏。</td></tr>
                  <tr className="bg-[#121824]"><td className="p-3 border border-[#2a3a5a] text-[#00ffcc] font-bold">維生素 B1、B12、葉酸</td><td className="p-3 border border-[#2a3a5a]">視神經</td><td className="p-3 border border-[#2a3a5a]">嚴重缺乏可能造成營養性視神經病變；主要作用是避免缺乏以維持神經傳導。</td></tr>
                </tbody>
              </table>
            </div>
            <div className="bg-[#2a1f1a] p-5 rounded-lg border border-[#e5b55e] mb-6">
              <h3 className="text-[#e5b55e] text-[18px] font-bold mb-3">📚 主要資料來源</h3>
              <ul className="text-[#a5b6cf] text-[14px] leading-[1.6] pl-5 m-0 space-y-1">
                <li>中華民國發明專利第I5105744號〈用於治療眼疾的化合物〉</li>
                <li>台灣綠蜂膠萃取物眼疾專利</li>
                <li>美國國家眼科研究所 (NEI): AREDS / AREDS2 及 DREAM 乾眼研究</li>
                <li>NIH 膳食補充品辦公室: 維生素A、Omega-3、鋅</li>
                <li>Merck Manual: 營養性與毒性視神經病變</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {currentView === 'INFO_RPE' && (
        <div className="absolute inset-0 z-50 bg-[#0f141e] overflow-y-auto p-5 box-border">
          <div className="max-w-[800px] mx-auto pb-[50px]">
            <button onClick={() => setCurrentView('INFO_NUTRIENT')} className="px-6 py-3 bg-[#1a2233] text-[#fffdd0] border border-[#2a3a5a] rounded-lg mb-5 cursor-pointer text-[18px] font-bold shadow-lg">🔙 返回營養百科</button>
            <h2 className="text-[#fffdd0] text-[28px] border-b-2 border-[#2B579A] pb-2.5 mb-[20px] font-bold">🧬 為什麼視網膜色素上皮 (RPE) 很重要？</h2>
            <div className="bg-[#161b22] p-6 rounded-xl border-l-4 border-[#E5B55E] mb-6">
              <h3 className="text-[#E5B55E] text-[22px] font-bold mb-3">👁️ 眼睛後勤樞紐與專屬垃圾處理廠</h3>
              <p className="text-[#fffdd0] text-[16px] leading-[1.8] m-0 mb-4">視網膜色素上皮細胞（RPE）緊貼著感光細胞，是維持視覺運作不可或缺的後勤防線。它具備以下五大關鍵生理功能：</p>
              <ul className="text-[#8b9bb4] text-[16px] leading-[1.8] pl-5 m-0 space-y-3">
                <li><strong className="text-[#fffdd0]">1. 運輸營養素：</strong>作為脈絡膜微血管與視網膜間的橋樑，將維生素、氧氣等營養素精準運送給感光細胞。</li>
                <li><strong className="text-[#fffdd0]">2. 排除代謝廢物：</strong>感光細胞每天運作會產生大量代謝廢物，RPE 就像垃圾處理廠，負責吞噬並分解這些廢物。</li>
                <li><strong className="text-[#fffdd0]">3. 分泌抗氧化因子：</strong>RPE 能分泌多種因子，維持眼內的抗氧化能力，保護脆弱的感光細胞免受強光與氧化壓力破壞。</li>
                <li><strong className="text-[#fffdd0]">4. 穩定視網膜結構：</strong>作為血視網膜屏障（Blood-Retinal Barrier）的重要部分，維持視網膜與脈絡膜界面的組織結構穩固。</li>
                <li><strong className="text-[#fffdd0]">5. 預防黃斑部病變：</strong>維持 RPE 的健康活力，能有效避免老化廢物堆積引發的發炎反應，是降低老年性黃斑部病變 (AMD) 發生風險的核心機制。</li>
              </ul>
            </div>
            <div className="bg-[#162b2b] p-6 rounded-xl border-l-4 border-[#ff4d4d] mb-6">
              <h3 className="text-[#ff4d4d] text-[22px] font-bold mb-3">☣️ 視力的隱形殺手：脂褐質 (Lipofuscin)</h3>
              <p className="text-[#fffdd0] text-[16px] leading-[1.8] mb-4">在視覺運作的過程中，感光細胞會不斷代謝並產生廢棄物。這些廢棄物被 RPE 吞噬後，會殘留下無法被完全分解的物質，稱為<strong>「脂褐質 (Lipofuscin)」</strong>（一種衰老色素）。脂褐質對眼睛的影響極具破壞性：</p>
              <ul className="text-[#8b9bb4] text-[16px] leading-[1.8] pl-5 m-0 space-y-2">
                <li><strong className="text-[#fffdd0]">引發光毒性反應：</strong>脂褐質含有具備光毒性的螢光物質（如 A2E），當受到藍光或強光照射時，會產生大量的自由基與「氧化壓力」。</li>
                <li><strong className="text-[#fffdd0]">摧毀細胞機能：</strong>過多的脂褐質會破壞 RPE 細胞內的溶酶體與粒線體，導致 RPE 細胞逐漸凋亡。</li>
                <li><strong className="text-[#fffdd0]">引發黃斑部病變：</strong>當 RPE 無法再處理廢物時，這些物質會堆積在視網膜底層形成「隱結 (Drusen)」，這是引發老年性黃斑部病變 (AMD) 和視力喪失的關鍵元凶。</li>
              </ul>
            </div>
            <div className="bg-[#1a2233] p-6 rounded-xl border-l-4 border-[#00ffcc] mb-6">
              <h3 className="text-[#00ffcc] text-[22px] font-bold mb-3">🛡️ RPE 是對抗脂褐質的唯一防線</h3>
              <p className="text-[#fffdd0] text-[16px] leading-[1.8] m-0">RPE 是視網膜中唯一具備強大吞噬與代謝機制的細胞。健康的 RPE 能夠透過自身的抗氧化系統，中和脂褐質產生的毒性，並盡可能減緩其堆積速度。<br/><br/>一旦 RPE 失去活力或受損，脂褐質就會如同無法被清理的「核廢料」般引發一連串的發炎反應，最終導致上方依賴它的感光細胞餓死或毒死。因此，<strong>給予 RPE 充足的專屬滋養與抗氧化保護，維持 RPE 細胞的存活率與代謝活力，是預防眼部老化與病變的重中之重。</strong></p>
            </div>
            <div className="bg-[#2a1f1a] p-4 rounded-lg border border-[#e5b55e]">
              <h3 className="text-[#e5b55e] text-[16px] font-bold mb-2">📚 醫學學理參考文獻</h3>
              <p className="text-[#a5b6cf] text-[13px] leading-[1.6] m-0">Sparrow, J. R., & Boulton, M. (2005). RPE lipofuscin and its role in retinal pathobiology. Experimental eye research.<br/>Boulton, M., et al. (2001). Lipofuscin is a photoinducible free radical generator. Journal of photochemistry and photobiology.</p>
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
              <p className="text-[#8b9bb4] text-center text-[18px] m-0 mb-[5px]">建議搭配醫師推薦營養配方，每天復健三次</p>
              <p className="text-[#8b9bb4] text-center text-[18px] m-0 mb-[25px]">還有最重要的眼睛要適度的休息</p>
              <div className="grid grid-cols-7 gap-[5px] mb-[15px]">{['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} className="text-[#888] text-center text-[18px]">{d}</div>)}</div>
              <div className="grid grid-cols-7 gap-y-2.5 gap-x-1.5">
                {calendarData.days.map((cycles, idx) => (
                  <div key={idx} className={`flex items-center justify-center w-[44px] h-[44px] mx-auto rounded-full text-[20px] font-bold ${cycles === -1 ? 'bg-transparent text-transparent' : cycles === 0 ? 'bg-[#2a3241] text-[#6b7280]' : cycles === 1 ? 'bg-[#4D96FF] text-white' : cycles === 2 ? 'bg-[#6BCB77] text-white' : 'bg-[#FF9F1C] text-white'} ${(idx - (calendarData.days.length - (new Date(calendarData.year, calendarData.month + 1, 0).getDate())) + 1) === calendarData.today ? 'border-2 border-[#E5B55E]' : ''}`}>
                    {cycles === -1 ? '' : idx - (calendarData.days.length - (new Date(calendarData.year, calendarData.month + 1, 0).getDate())) + 1}
                  </div>
                ))}
              </div>
              <button onClick={handleShareCalendar} className="w-full p-[18px] mt-[25px] bg-[#2B579A] text-white border-none rounded-xl text-[20px] font-bold cursor-pointer">▷ 傳送每日/每月復健次數</button>
            </div>
          </div>
        </div>
      )}

      {currentView === 'INFO_MODULES' && (
        <div className="absolute inset-0 z-50 bg-[#0f141e] overflow-y-auto p-5 box-border">
          <div className="max-w-[800px] mx-auto pb-[50px]">
            <button onClick={() => setCurrentView('DASHBOARD')} className="px-6 py-3 bg-[#1a2233] text-[#fffdd0] border border-[#2a3a5a] rounded-lg mb-5 cursor-pointer text-[18px] font-bold">🔙 返回大廳</button>
            <h2 className="text-[#fffdd0] text-[28px] border-b-2 border-[#00ffcc] pb-2.5 mb-[15px] font-bold">🩺 數位復健模組學理與文獻探討</h2>
            <div className="mb-8 bg-[#1f1616] p-5 rounded-lg border border-[#ff4d4d] shadow-[0_0_10px_rgba(255,77,77,0.2)]">
              <h3 className="text-[#ff4d4d] text-[20px] font-bold mb-3 flex items-center gap-2"><span>⚠️</span> 醫療法規與免責聲明</h3>
              <p className="text-[#d1b0b0] text-[16px] leading-[1.8] m-0">本應用程式定位為日常視覺疲勞之放鬆與保健輔助工具，<strong>非屬醫療器材</strong>。下方引述之醫學期刊僅作為視覺生理學及模組設計之學理背景參考，<strong>不代表本系統具有診斷、治療、矯正任何眼科疾病之療效</strong>。</p>
            </div>
            <div className="mb-6 bg-[#1a2233] p-6 rounded-xl border-l-4 border-[#FF6B6B]">
              <h3 className="text-[#FF6B6B] text-[22px] font-bold mb-3">🚀 45秒快速舒緩</h3>
              <p className="text-[#fffdd0] text-[17px] leading-[1.6] mb-4"><strong>設計原理：</strong>結合動態視覺刺激與淚膜穩定概念。輔助舒緩初期水晶體對焦壓力，並藉由閉眼動作輔助眼瞼板腺分泌油脂。</p>
              <div className="bg-[#0f141e] p-4 rounded-lg"><span className="text-[#8b9bb4] text-[14px] block mb-1">文獻參考：Rosenfield, M. (2011). Computer vision syndrome... Ophthalmic and Physiological Optics.</span></div>
            </div>
            <div className="mb-6 bg-[#1a2233] p-6 rounded-xl border-l-4 border-[#4D96FF]">
              <h3 className="text-[#4D96FF] text-[22px] font-bold mb-3">🔄 動態 3D 眼肌伸展</h3>
              <p className="text-[#fffdd0] text-[17px] leading-[1.6] mb-4"><strong>設計原理：</strong>透過眼球的極限軌跡追蹤（平滑追隨運動），引導六條眼外肌進行大範圍伸展活動，幫助眼周肌肉放鬆。</p>
              <div className="bg-[#0f141e] p-4 rounded-lg"><span className="text-[#8b9bb4] text-[14px] block mb-1">文獻參考：Kim, S. D., et al. (2016). Effects of eye exercises... Journal of Physical Therapy Science.</span></div>
            </div>
            <div className="mb-6 bg-[#1a2233] p-6 rounded-xl border-l-4 border-[#6BCB77]">
              <h3 className="text-[#6BCB77] text-[22px] font-bold mb-3">🎮 睫狀肌深空追光</h3>
              <p className="text-[#fffdd0] text-[17px] leading-[1.6] mb-4"><strong>設計原理：</strong>利用 3D 空間營造「光學無限遠（Optical Infinity）」的錯覺。引導視線向深空遠眺，協助控制水晶體的睫狀肌放鬆，作為輔助對抗因長時間近距離工作所引起的調節性疲勞之日常運動。</p>
              <div className="bg-[#0f141e] p-4 rounded-lg"><span className="text-[#8b9bb4] text-[14px] block mb-1">文獻參考：Tosha, C., et al. (2009). Accommodation response and visual discomfort. Ophthalmic and Physiological Optics.</span></div>
            </div>
            <div className="mb-6 bg-[#1a2233] p-6 rounded-xl border-l-4 border-[#FFD93D]">
              <h3 className="text-[#FFD93D] text-[22px] font-bold mb-3">🌌 星雲散焦與神經放鬆</h3>
              <p className="text-[#fffdd0] text-[17px] leading-[1.6] mb-4"><strong>設計原理：</strong>透過解除中央凹對焦並刻意體驗「周邊視覺」，配合固定頻率的深度共振呼吸，能夠輔助調節自律神經張力，幫助放鬆身心與日常視覺壓力。</p>
              <div className="bg-[#0f141e] p-4 rounded-lg"><span className="text-[#8b9bb4] text-[14px] block mb-1">文獻參考：Zaccaro, A., et al. (2018). How breath-control can change your life. Frontiers in Human Neuroscience.</span></div>
            </div>
            <div className="mb-6 bg-[#1a2233] p-6 rounded-xl border-l-4 border-[#FF3366]">
              <h3 className="text-[#FF3366] text-[22px] font-bold mb-3">🎯 Z 軸遠近對焦飛梭</h3>
              <p className="text-[#fffdd0] text-[17px] leading-[1.6] mb-4"><strong>設計原理：</strong>參考視覺活動中的「調節靈敏度（Accommodative Facility）」概念。藉由引導睫狀肌在看近與看遠之間進行快速切換活動，作為維持水晶體調節靈活度與反應速度的日常輔助練習。</p>
              <div className="bg-[#0f141e] p-4 rounded-lg"><span className="text-[#8b9bb4] text-[14px] block mb-1">文獻參考：Sterner, B., et al. (2001). Accommodation facility training. Documenta Ophthalmologica.</span></div>
            </div>
            <div className="text-center mt-8">
              <button onClick={() => setCurrentView('DASHBOARD')} className="px-[30px] py-[15px] bg-[#00ffcc] text-[#0f141e] border-none rounded-full text-[20px] font-bold cursor-pointer shadow-[0_4px_15px_rgba(0,255,204,0.3)]">👉 返回大廳開始訓練</button>
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

      {/* 視圖 6: 訓練進行中 (TRAINING) 與 互動回饋 */}
      {currentView === 'TRAINING' && (
        <>
          <button onClick={returnToDashboard} className="absolute top-5 left-5 px-6 py-3 bg-[#1a2233] text-[#fffdd0] border border-[#2a3a5a] rounded-lg font-bold text-[18px] cursor-pointer z-20 pointer-events-auto shadow-lg">🔙 返回大廳</button>
          
          {/* AI 畫中畫校正窗 (PIP) */}
          {['sop', 'stretch', 'chaser', 'breathe', 'focus', 'amsler', 'astigmatism'].includes(gameState.current.module) && (
            <div className="absolute bottom-5 right-5 w-[100px] h-[130px] bg-black border-2 border-[#E5B55E] rounded-lg overflow-hidden z-30 shadow-lg pointer-events-none">
              <video ref={videoRef} className="w-full h-full object-cover transform scale-x-[-1]" playsInline muted autoPlay />
            </div>
          )}

          {/* 載入中全螢幕等待畫面 */}
          {trackingState === 'INITIALIZING' && (
            <div className="absolute inset-0 z-40 bg-[#0f141e]/90 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-auto">
              <div className="text-[60px] mb-4 animate-spin">⏳</div>
              <h2 className="text-[#00ffcc] text-[28px] font-bold mb-4 tracking-widest">AI 視覺引擎載入中</h2>
              <p className="text-[#fffdd0] text-[18px] text-center px-6 leading-[1.8]">
                正在啟動前置鏡頭與安全辨識模組...<br/>這可能需要幾秒鐘的時間，請稍候。
              </p>
            </div>
          )}

          {/* 距離過近警告 */}
          {trackingState === 'TOO_CLOSE' && !gameState.current.isResting && gameState.current.phase !== 'COMPLETED' && (
            <div className="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center backdrop-blur-md pointer-events-auto">
              <div className="text-[60px] mb-4">🛑</div>
              <h2 className="text-[#E5B55E] text-[28px] font-bold mb-4 tracking-widest">距離螢幕太近</h2>
              <p className="text-[#fffdd0] text-[18px] text-center px-6 leading-[1.8]">
                訓練與時間已自動暫停。<br/>請退後至 <strong className="text-[#00ffcc]">20 公分安全距離</strong> 外。
              </p>
            </div>
          )}

          {/* 失去追蹤的防呆紅屏警告 */}
          {trackingState === 'LOST' && !gameState.current.isResting && gameState.current.phase !== 'COMPLETED' && (
            <div className="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center backdrop-blur-md pointer-events-auto">
              <div className="text-[60px] mb-4">⚠️</div>
              <h2 className="text-[#ff4d4d] text-[28px] font-bold mb-4 tracking-widest">頭部偏離或失去視線</h2>
              <p className="text-[#fffdd0] text-[18px] text-center px-6 leading-[1.8]">
                訓練與時間已暫停。<br/>請確保<strong className="text-[#E5B55E]">臉部正對螢幕</strong>。
              </p>
            </div>
          )}

          <div className="absolute inset-x-0 w-full px-5 box-border flex flex-col items-center justify-center text-center pointer-events-none drop-shadow-[0px_4px_15px_rgba(0,0,0,0.9)] z-10 transition-all duration-[1.2s] ease-[cubic-bezier(0.25,1,0.5,1)]" style={{ top: uiState.top, transform: 'translateY(-50%)' }}>
            <div className="w-full text-center text-[#fffdd0] text-[26px] font-bold tracking-[1px] mb-[15px] leading-[1.5] flex flex-col items-center justify-center">{uiState.title}</div>
            <div className="w-full text-center text-[#00ffcc] font-mono text-[24px] mb-[20px]">{uiState.timer}</div>
            
            {uiState.showInput && (
              <div className="flex flex-col gap-4 w-full max-w-[300px] pointer-events-auto mt-4">
                <button onClick={() => handleDiagnosticInput('NORMAL')} className="w-full py-4 bg-[#162b2b] border-2 border-[#00ffcc] text-[#00ffcc] rounded-xl text-[20px] font-bold cursor-pointer shadow-[0_0_15px_rgba(0,255,204,0.3)]">✅ 正常 (清晰無異常)</button>
                <button onClick={() => handleDiagnosticInput('ABNORMAL')} className="w-full py-4 bg-[#2b1616] border-2 border-[#ff4d4d] text-[#ff4d4d] rounded-xl text-[20px] font-bold cursor-pointer shadow-[0_0_15px_rgba(255,77,77,0.3)]">❌ 異常 (有扭曲/模糊/黑影)</button>
              </div>
            )}
            
            {uiState.showContinue && (
              <button onClick={() => { gameState.current.isWaitingForRightEye = false; playDingSound(); setUiState(prev => ({...prev, showContinue: false})); }} className="mt-5 px-6 py-3 bg-[#00ffcc] text-[#0f141e] border-none rounded-[30px] text-[18px] font-bold cursor-pointer pointer-events-auto shadow-[0_4px_15px_rgba(0,255,204,0.4)]">▶ 準備好了，繼續訓練右眼</button>
            )}
          </div>
        </>
      )}

      {/* 視圖 7: 測試評估報告 (TEST_REPORT) */}
      {currentView === 'TEST_REPORT' && (
        <div className="absolute inset-0 z-50 bg-[#0f141e] overflow-y-auto p-5 box-border flex flex-col items-center justify-center">
          <div className="w-full max-w-[600px] bg-[#1a2233] p-8 rounded-2xl border-2 border-[#9D4EDD] shadow-[0_0_25px_rgba(157,78,221,0.3)] mt-[80px] mb-[40px]">
            <h2 className="text-[#fffdd0] text-[28px] text-center border-b-2 border-[#9D4EDD] pb-3 mb-[20px] font-bold">📄 數位視覺評估報告</h2>
            <div className="mb-6 bg-[#1f1616] p-4 rounded-lg border border-[#ff4d4d]">
              <p className="text-[#d1b0b0] text-[15px] leading-[1.6] m-0 text-center">⚠️ 免責聲明：本報告基於您的主觀輸入，僅供日常保健評估參考，不代表醫學診斷。若有異常請立即就醫。</p>
            </div>
            <div className="flex justify-between items-center bg-[#161b22] p-5 rounded-xl mb-4"><span className="text-[#fffdd0] text-[20px]">左眼評估結果</span><span className={`text-[22px] font-bold ${testResults.leftEye === 'NORMAL' ? 'text-[#00ffcc]' : 'text-[#ff4d4d]'}`}>{testResults.leftEye === 'NORMAL' ? '✅ 正常' : '❌ 發現異常'}</span></div>
            <div className="flex justify-between items-center bg-[#161b22] p-5 rounded-xl mb-6"><span className="text-[#fffdd0] text-[20px]">右眼評估結果</span><span className={`text-[22px] font-bold ${testResults.rightEye === 'NORMAL' ? 'text-[#00ffcc]' : 'text-[#ff4d4d]'}`}>{testResults.rightEye === 'NORMAL' ? '✅ 正常' : '❌ 發現異常'}</span></div>
            <div className="bg-[#2a1f1a] p-5 rounded-xl border border-[#e5b55e] mb-8">
              <h3 className="text-[#e5b55e] text-[20px] font-bold mb-2">🧠 系統建議與邏輯運算回饋</h3>
              <p className="text-[#fffdd0] text-[16px] leading-[1.6] m-0">{(testResults.leftEye === 'NORMAL' && testResults.rightEye === 'NORMAL') ? "太棒了！您的雙眼視覺狀態良好。請繼續保持良好的用眼習慣，並建議搭配營養配方與數位眼肌訓練模組作為日常保養。" : "系統運算警告：偵測到潛在的視覺扭曲或模糊異常。這可能是黃斑部或散光軸向的疲勞警訊，強烈建議您盡速尋求專業眼科醫師的精密儀器檢查！"}</p>
            </div>
            <button onClick={returnToDashboard} className="w-full py-4 bg-[#9D4EDD] text-white rounded-xl text-[20px] font-bold cursor-pointer shadow-[0_4px_15px_rgba(157,78,221,0.5)]">完成並返回大廳</button>
          </div>
        </div>
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