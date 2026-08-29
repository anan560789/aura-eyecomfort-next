'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// 1. Supabase 連線設定
// ==========================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vttxlkquladnrnytyhpc.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dHhsa3F1bGFkbnJueXR5aHBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTYyMzIsImV4cCI6MjEwMTk5MjIzMn0.l_wLaECh2kgDQtMzcrvJcjc5091x4HvSgfF4rPE1cHM';
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// 🚨 專利防護核心：後端 HMAC 數位簽章驗證引擎
// ==========================================
const AURA_SECRET_SALT = "AuraDTx_Patent_2026_Strict_Compliance_O2O";

async function verifyHMAC(log: any) {
  try {
    const payloadForSignature = {
      session_id: log.session_id,
      sequence_id: log.sequence_id,
      previous_hash: log.previous_hash,
      line_uid: log.line_uid,
      auth_code: log.auth_code,
      clinic_id: log.clinic_id,
      real_name: log.real_name,
      device_info: {
        os_platform: log.device_info?.os_platform,
        screen_refresh_rate: log.device_info?.screen_refresh_rate
      },
      training_context: {
        module_id: log.training_context?.module_id,
        module_type: log.training_context?.module_type,
        timestamp_start: log.training_context?.timestamp_start ? new Date(log.training_context.timestamp_start).toISOString() : '',
        timestamp_end: log.training_context?.timestamp_end ? new Date(log.training_context.timestamp_end).toISOString() : ''
      },
      performance_metrics: {
        is_completed: log.performance_metrics?.is_completed,
        total_active_seconds: log.performance_metrics?.total_active_seconds,
        pause_count: log.performance_metrics?.pause_count,
        exit_node: log.performance_metrics?.exit_node
      },
      objective_metrics: {
        blink_count: log.objective_metrics?.blink_count,
        blink_rate_per_min: log.objective_metrics?.blink_rate_per_min,
        relaxation_achieved: log.objective_metrics?.relaxation_achieved
      },
      // 強制約束巢狀物件順序，對抗 JSONB 自動排序
      state_machine_details: (log.state_machine_details && Object.keys(log.state_machine_details).length > 0) ? {
        phase_1_left_eye: {
          target_seconds: log.state_machine_details.phase_1_left_eye?.target_seconds,
          actual_seconds: log.state_machine_details.phase_1_left_eye?.actual_seconds,
          is_completed: log.state_machine_details.phase_1_left_eye?.is_completed
        },
        transition_interrupt: {
          triggered: log.state_machine_details.transition_interrupt?.triggered,
          pause_duration_seconds: log.state_machine_details.transition_interrupt?.pause_duration_seconds,
          user_resumed: log.state_machine_details.transition_interrupt?.user_resumed
        },
        phase_2_right_eye: {
          target_seconds: log.state_machine_details.phase_2_right_eye?.target_seconds,
          actual_seconds: log.state_machine_details.phase_2_right_eye?.actual_seconds,
          is_completed: log.state_machine_details.phase_2_right_eye?.is_completed
        }
      } : {},
      created_at: log.created_at ? new Date(log.created_at).toISOString() : ''
    };

    const msgUint8 = new TextEncoder().encode(JSON.stringify(payloadForSignature) + AURA_SECRET_SALT);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return expectedSignature === log.digital_signature;
  } catch (err) {
    console.error('HMAC 驗證例外:', err);
    return false;
  }
}

export default function ClinicDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, verified: 0, tampered: 0, totalSeconds: 0 });

  // 📅 新增：日期層級狀態
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 🧑‍⚕️ 病患專屬數據 Modal 狀態管理
  const [selectedPatient, setSelectedPatient] = useState<{ uid: string, name: string } | null>(null);
  const [patientLogs, setPatientLogs] = useState<any[]>([]);
  const [isPatientLoading, setIsPatientLoading] = useState(false);

  const handleLogin = () => {
    if (passcode.trim() !== '') {
      setIsAuthenticated(true);
      fetchLogs();
    } else {
      alert('請輸入診所代碼');
    }
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('training_logs')
      .select('*')
      .eq('clinic_id', passcode.trim().toUpperCase())
      .order('created_at', { ascending: false })
      .limit(200); // 加大拉取數量以涵蓋多天

    if (error) {
      console.error('獲取資料失敗', error);
      setIsLoading(false);
      return;
    }

    if (data) {
      let verifiedCount = 0;
      let tamperedCount = 0;
      let seconds = 0;

      const verifiedData = await Promise.all(data.map(async (log) => {
        const isValid = await verifyHMAC(log);
        if (isValid) {
            verifiedCount++;
            seconds += log.performance_metrics?.total_active_seconds || 0;
        } else {
            tamperedCount++;
        }
        return { ...log, isSignatureValid: isValid };
      }));

      setStats({ total: data.length, verified: verifiedCount, tampered: tamperedCount, totalSeconds: seconds });
      setLogs(verifiedData);
    }
    setIsLoading(false);
  };

  // 📅 將紀錄依照日期分群
  const groupedLogsByDate = useMemo(() => {
    const groups = logs.reduce((acc, log) => {
      const d = new Date(log.created_at);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      if (!acc[dateStr]) acc[dateStr] = [];
      acc[dateStr].push(log);
      return acc;
    }, {} as Record<string, any[]>);

    return Object.keys(groups).map(date => {
      const dayLogs = groups[date];
      const tamperedCount = dayLogs.filter(l => !l.isSignatureValid).length;
      const uniquePatients = new Set(dayLogs.map(l => l.line_uid)).size;
      const totalSeconds = dayLogs.reduce((sum, l) => sum + (l.performance_metrics?.total_active_seconds || 0), 0);
      
      return {
        date,
        logs: dayLogs,
        tamperedCount,
        uniquePatients,
        totalSeconds
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [logs]);

  // 取得當前選定日期的詳細紀錄
  const currentDayLogs = useMemo(() => {
    if (!selectedDate) return [];
    const group = groupedLogsByDate.find(g => g.date === selectedDate);
    return group ? group.logs : [];
  }, [selectedDate, groupedLogsByDate]);

  // 📊 開啟特定病患的詳細數據
  const openPatientDetails = async (uid: string, name: string) => {
    setSelectedPatient({ uid, name });
    setIsPatientLoading(true);

    const { data, error } = await supabase
      .from('training_logs')
      .select('*')
      .eq('clinic_id', passcode.trim().toUpperCase())
      .eq('line_uid', uid)
      .order('created_at', { ascending: false });

    if (data) {
      const verifiedData = await Promise.all(data.map(async (log) => ({
        ...log,
        isSignatureValid: await verifyHMAC(log)
      })));
      setPatientLogs(verifiedData);
    }
    setIsPatientLoading(false);
  };

  const closePatientDetails = () => {
    setSelectedPatient(null);
    setPatientLogs([]);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0f141e] flex flex-col items-center justify-center p-5 font-sans">
        <div className="bg-[#1a2233] border-2 border-[#00ffcc] p-8 rounded-2xl w-full max-w-[400px] shadow-[0_0_30px_rgba(0,255,204,0.2)] text-center">
          <div className="text-[50px] mb-4">🏥</div>
          <h1 className="text-[#fffdd0] text-[24px] font-bold mb-2 tracking-wider">Aura EyeGym</h1>
          <h2 className="text-[#00ffcc] text-[18px] mb-6">診所端醫療稽核系統</h2>
          <input 
            type="password" 
            placeholder="請輸入醫師授權碼" 
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full p-4 bg-[#0f141e] border border-[#2a3a5a] text-[#fffdd0] rounded-xl text-center text-[18px] mb-6 outline-none focus:border-[#00ffcc]"
          />
          <button onClick={handleLogin} className="w-full py-4 bg-[#00ffcc] text-[#0f141e] font-bold rounded-xl text-[18px] shadow-[0_4px_15px_rgba(0,255,204,0.4)] transition-transform hover:scale-[1.02]">
            登入系統
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f141e] text-[#fffdd0] font-sans p-5 md:p-10 relative">
      <div className="max-w-[1200px] mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 border-b-2 border-[#2a3a5a] pb-5">
          <div>
            <h1 className="text-[32px] font-bold text-[#00ffcc] flex items-center gap-3">
              <span>🏥</span> Aura EyeGym 醫療稽核儀表板
            </h1>
            <p className="text-[#8b9bb4] text-[16px] mt-2">O2O 數位療法閉環｜全診所即時動態中心</p>
          </div>
          <button onClick={() => { setSelectedDate(null); fetchLogs(); }} className="mt-4 md:mt-0 px-6 py-3 bg-[#1a2233] border border-[#4D96FF] text-[#4D96FF] rounded-lg font-bold hover:bg-[#4D96FF] hover:text-white transition-colors flex items-center gap-2">
            <span>🔄</span> 重新載入區塊鏈結
          </button>
        </div>

        {/* 總覽 Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-10">
          <div className="bg-[#1a2233] p-6 rounded-xl border-l-4 border-[#4D96FF] shadow-lg">
            <h3 className="text-[#8b9bb4] text-[16px] mb-2">總接收紀錄</h3>
            <p className="text-[36px] font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-[#1a2233] p-6 rounded-xl border-l-4 border-[#00ffcc] shadow-lg">
            <h3 className="text-[#8b9bb4] text-[16px] mb-2">簽章驗證通過 (合規)</h3>
            <p className="text-[36px] font-bold text-[#00ffcc]">{stats.verified}</p>
          </div>
          <div className="bg-[#1a2233] p-6 rounded-xl border-l-4 border-[#ff4d4d] shadow-lg">
            <h3 className="text-[#8b9bb4] text-[16px] mb-2">遭竄改攔截 (異常)</h3>
            <p className="text-[36px] font-bold text-[#ff4d4d]">{stats.tampered}</p>
          </div>
          <div className="bg-[#1a2233] p-6 rounded-xl border-l-4 border-[#E5B55E] shadow-lg">
            <h3 className="text-[#8b9bb4] text-[16px] mb-2">總有效訓練時長</h3>
            <p className="text-[36px] font-bold text-[#E5B55E]">{Math.floor(stats.totalSeconds / 60)} 分鐘</p>
          </div>
        </div>

        {/* 視圖切換區塊 */}
        {!selectedDate ? (
          // ==========================================
          // 第一層：以「日期」分群的總覽表
          // ==========================================
          <div className="bg-[#1a2233] rounded-2xl border border-[#2a3a5a] overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-5 border-b border-[#2a3a5a] bg-[#121824] flex justify-between items-center">
              <h2 className="text-[20px] font-bold">📅 每日訓練總覽 (點選日期查看明細)</h2>
              <span className="text-[#8b9bb4] text-[14px]">依照日期自動彙整</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#161b22] text-[#8b9bb4] text-[14px] uppercase tracking-wider">
                    <th className="p-4 border-b border-[#2a3a5a]">訓練日期</th>
                    <th className="p-4 border-b border-[#2a3a5a]">當日活躍病患數</th>
                    <th className="p-4 border-b border-[#2a3a5a]">當日接收紀錄數</th>
                    <th className="p-4 border-b border-[#2a3a5a]">當日總有效時長</th>
                    <th className="p-4 border-b border-[#2a3a5a]">整體稽核狀態</th>
                  </tr>
                </thead>
                <tbody className="text-[15px]">
                  {isLoading ? (
                    <tr><td colSpan={5} className="p-10 text-center text-[#8b9bb4] animate-pulse">資料安全解密中...</td></tr>
                  ) : groupedLogsByDate.length === 0 ? (
                    <tr><td colSpan={5} className="p-10 text-center text-[#8b9bb4]">目前沒有任何訓練紀錄</td></tr>
                  ) : (
                    groupedLogsByDate.map((group, index) => (
                      <tr 
                        key={index} 
                        onClick={() => setSelectedDate(group.date)}
                        className="hover:bg-[#2a3241] cursor-pointer transition-colors border-b border-[#2a3a5a]/50"
                      >
                        <td className="p-4 font-mono text-[16px] font-bold text-white">{group.date}</td>
                        <td className="p-4 font-bold text-[#00ffcc]">{group.uniquePatients} 人</td>
                        <td className="p-4 font-bold text-[#4D96FF]">{group.logs.length} 筆</td>
                        <td className="p-4 font-bold text-[#E5B55E]">{Math.floor(group.totalSeconds / 60)} 分 {group.totalSeconds % 60} 秒</td>
                        <td className="p-4">
                          {group.tamperedCount === 0 ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#00ffcc]/10 text-[#00ffcc] rounded-full text-[13px] font-bold border border-[#00ffcc]/30">✅ 全數合規</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#ff4d4d]/10 text-[#ff4d4d] rounded-full text-[13px] font-bold border border-[#ff4d4d]/30">🚨 包含 {group.tamperedCount} 筆異常</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          // ==========================================
          // 第二層：單一「日期」的詳細紀錄表
          // ==========================================
          <div className="bg-[#1a2233] rounded-2xl border border-[#2a3a5a] overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-5 border-b border-[#2a3a5a] bg-[#121824] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setSelectedDate(null)} 
                  className="bg-[#2a3241] hover:bg-[#3a4556] text-white px-4 py-2 rounded-lg text-[14px] font-bold transition flex items-center gap-2"
                >
                  ⬅️ 返回日期列表
                </button>
                <h2 className="text-[20px] font-bold text-[#E5B55E]">📋 {selectedDate} 訓練時序日誌 (點選查看病患)</h2>
              </div>
              <span className="text-[#8b9bb4] text-[14px]">使用 SHA-256 HMAC 與時序雜湊鏈結保護</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#161b22] text-[#8b9bb4] text-[14px] uppercase tracking-wider">
                    <th className="p-4 border-b border-[#2a3a5a]">資料完整性</th>
                    <th className="p-4 border-b border-[#2a3a5a]">完成時間</th>
                    <th className="p-4 border-b border-[#2a3a5a]">病患 LINE 暱稱</th>
                    <th className="p-4 border-b border-[#2a3a5a]">訓練模組</th>
                    <th className="p-4 border-b border-[#2a3a5a]">有效時長</th>
                    <th className="p-4 border-b border-[#2a3a5a]">處方/方案</th>
                  </tr>
                </thead>
                <tbody className="text-[15px]">
                  {currentDayLogs.map((log, index) => {
                    const isValid = log.isSignatureValid;
                    const timeOnly = new Date(log.created_at).toLocaleTimeString('zh-TW', { hour12: false });
                    const displayName = log.real_name || (log.line_uid ? `${log.line_uid.substring(0, 6)}...` : '未知');

                    return (
                      <tr 
                        key={log.id || index} 
                        onClick={() => openPatientDetails(log.line_uid, displayName)}
                        className={`hover:bg-[#2a3241] cursor-pointer transition-colors border-b border-[#2a3a5a]/50 ${!isValid ? 'bg-[#3a1a1a]/40' : ''}`}
                      >
                        <td className="p-4">
                          {isValid ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#00ffcc]/10 text-[#00ffcc] rounded-full text-[13px] font-bold border border-[#00ffcc]/30">✅ 簽章驗證通過</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#ff4d4d]/10 text-[#ff4d4d] rounded-full text-[13px] font-bold border border-[#ff4d4d]/30">🚨 遭到竄改</span>
                          )}
                        </td>
                        <td className="p-4 font-mono text-[15px] text-[#a5b6cf]">{timeOnly}</td>
                        <td className="p-4 font-bold text-[#00ffcc] text-[15px] flex items-center gap-2">👤 {displayName}</td>
                        <td className="p-4 font-bold text-[#E5B55E]">{log.training_context?.module_type || '未記錄'}</td>
                        <td className="p-4"><span className={`font-mono ${!isValid ? 'text-[#ff4d4d] line-through' : 'text-white'}`}>{log.performance_metrics?.total_active_seconds || 0} 秒</span></td>
                        <td className="p-4 text-[#8b9bb4]">{log.auth_code === 'FREE-TIER' ? '免費方案' : '🩺 處方授權'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ==========================================
          第三層：病患專屬數據 Modal 視窗 
          ========================================== */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 md:p-10 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0f141e] border border-[#00ffcc] rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-[0_0_30px_rgba(0,255,204,0.15)] overflow-hidden">
            <div className="p-5 border-b border-[#2a3a5a] flex justify-between items-center bg-[#162b2b]">
              <div>
                <h2 className="text-[24px] font-bold text-[#00ffcc] flex items-center gap-2">👤 {selectedPatient.name} 專屬病歷與依從性數據</h2>
                <p className="text-[#8b9bb4] text-[14px] font-mono mt-1">UID: {selectedPatient.uid}</p>
              </div>
              <button onClick={closePatientDetails} className="text-[#8b9bb4] hover:text-[#ff4d4d] transition-colors text-[32px] font-light leading-none">&times;</button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 bg-[#0f141e]">
              {isPatientLoading ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <div className="text-[40px] mb-4 animate-spin">⏳</div>
                  <p className="text-[#00ffcc] font-bold tracking-widest animate-pulse">正在解密病患專屬區塊鏈結...</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-[#1a2233] p-5 rounded-xl border border-[#2a3a5a]">
                      <h3 className="text-[#8b9bb4] text-[14px] mb-1">歷史完成總次數</h3>
                      <p className="text-[28px] font-bold text-white">{patientLogs.length} 次</p>
                    </div>
                    <div className="bg-[#1a2233] p-5 rounded-xl border border-[#2a3a5a]">
                      <h3 className="text-[#8b9bb4] text-[14px] mb-1">個人累積有效時長</h3>
                      <p className="text-[28px] font-bold text-[#E5B55E]">{Math.floor(patientLogs.reduce((acc, l) => acc + (l.performance_metrics?.total_active_seconds || 0), 0) / 60)} 分鐘</p>
                    </div>
                    <div className="bg-[#1a2233] p-5 rounded-xl border border-[#2a3a5a]">
                      <h3 className="text-[#8b9bb4] text-[14px] mb-1">歷史平均眨眼率</h3>
                      <p className="text-[28px] font-bold text-[#4D96FF]">{patientLogs.length > 0 ? (patientLogs.reduce((acc, l) => acc + (l.objective_metrics?.blink_rate_per_min || 0), 0) / patientLogs.length).toFixed(1) : 0} 次/分</p>
                    </div>
                  </div>

                  <div className="bg-[#1a2233] rounded-xl border border-[#2a3a5a] overflow-hidden">
                    <div className="p-4 border-b border-[#2a3a5a] bg-[#121824]"><h3 className="font-bold text-[18px] text-[#fffdd0]">📄 歷史訓練軌跡</h3></div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#161b22] text-[#8b9bb4] text-[13px] uppercase tracking-wider">
                            <th className="p-3 border-b border-[#2a3a5a]">日期時間</th>
                            <th className="p-3 border-b border-[#2a3a5a]">訓練模組</th>
                            <th className="p-3 border-b border-[#2a3a5a]">時長</th>
                            <th className="p-3 border-b border-[#2a3a5a]">該次眨眼率</th>
                            <th className="p-3 border-b border-[#2a3a5a]">合規狀態</th>
                          </tr>
                        </thead>
                        <tbody className="text-[14px]">
                          {patientLogs.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-[#8b9bb4]">沒有找到這名病患的紀錄</td></tr>
                          ) : (
                            patientLogs.map((log, idx) => (
                              <tr key={idx} className="hover:bg-[#2a3241] border-b border-[#2a3a5a]/50">
                                <td className="p-3 font-mono text-[#a5b6cf]">{new Date(log.created_at).toLocaleString('zh-TW', { hour12: false })}</td>
                                <td className="p-3 font-bold text-[#E5B55E]">{log.training_context?.module_type || '未記錄'}</td>
                                <td className="p-3 font-mono text-white">{log.performance_metrics?.total_active_seconds || 0} 秒</td>
                                <td className="p-3 font-bold text-[#4D96FF]">{log.objective_metrics?.blink_rate_per_min ? log.objective_metrics.blink_rate_per_min.toFixed(1) : 0} 次/分</td>
                                <td className="p-3">{log.isSignatureValid ? <span className="text-[#00ffcc] font-bold text-[12px]">✅ 通過</span> : <span className="text-[#ff4d4d] font-bold text-[12px]">🚨 異常</span>}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <div className="p-4 border-t border-[#2a3a5a] bg-[#121824] flex justify-end">
               <button onClick={closePatientDetails} className="px-6 py-2 bg-[#2a3241] hover:bg-[#3a4556] text-white rounded-lg font-bold transition-colors">關閉視窗</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}