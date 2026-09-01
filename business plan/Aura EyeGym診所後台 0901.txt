'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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
    return false;
  }
}

export default function ClinicDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [stats, setStats] = useState({ total: 0, verified: 0, tampered: 0, totalSeconds: 0 });

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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
      .limit(300);

    if (error) {
      console.error('獲取資料失敗', error);
      setIsLoading(false);
      return;
    }

    if (data) {
      let verifiedCount = 0;
      let tamperedCount = 0;
      let seconds = 0;

      const verifiedData = await Promise.all(data.map(async (log: any) => {
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

  // 第一層：將紀錄依照日期分群
  const groupedLogsByDate = useMemo(() => {
    const groups = logs.reduce((acc: Record<string, any[]>, log: any) => {
      const d = new Date(log.created_at);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!acc[dateStr]) acc[dateStr] = [];
      acc[dateStr].push(log);
      return acc;
    }, {});

    return Object.keys(groups).map(date => {
      const dayLogs = groups[date];
      return {
        date,
        logs: dayLogs,
        tamperedCount: dayLogs.filter((l: any) => !l.isSignatureValid).length,
        uniquePatients: new Set(dayLogs.map((l: any) => l.line_uid)).size,
        totalSeconds: dayLogs.reduce((sum: number, l: any) => sum + (l.performance_metrics?.total_active_seconds || 0), 0)
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [logs]);

  // 第二層：將當日紀錄依「病患 (LINE UID)」分群
  const currentDayPatients = useMemo(() => {
    if (!selectedDate) return [];
    const group = groupedLogsByDate.find(g => g.date === selectedDate);
    if (!group) return [];

    const patientMap: Record<string, any> = {};
    group.logs.forEach((log: any) => {
      const uid = log.line_uid;
      if (!patientMap[uid]) {
        patientMap[uid] = {
          line_uid: uid,
          real_name: log.real_name || (uid ? `${uid.substring(0, 6)}...` : '未知'),
          moduleCount: 0,
          lastCompletionTime: log.created_at,
          auth_code: log.auth_code,
          isSignatureValid: true,
        };
      }
      patientMap[uid].moduleCount += 1;
      if (!log.isSignatureValid) patientMap[uid].isSignatureValid = false;
      if (new Date(log.created_at).getTime() > new Date(patientMap[uid].lastCompletionTime).getTime()) {
         patientMap[uid].lastCompletionTime = log.created_at;
      }
    });

    return Object.values(patientMap).sort((a, b) => new Date(b.lastCompletionTime).getTime() - new Date(a.lastCompletionTime).getTime());
  }, [selectedDate, groupedLogsByDate]);

  // 第三層：開啟特定病患的詳細數據
  const openPatientDetails = async (uid: string, name: string) => {
    setSelectedPatient({ uid, name });
    setIsPatientLoading(true);

    const { data, error } = await supabase
      .from('training_logs')
      .select('*')
      .eq('clinic_id', passcode.trim().toUpperCase())
      .eq('line_uid', uid);

    if (data) {
      const verifiedData = await Promise.all(data.map(async (log: any) => ({
        ...log,
        isSignatureValid: await verifyHMAC(log)
      })));
      setPatientLogs(verifiedData);
    }
    setIsPatientLoading(false);
  };

  // 第三層：病患歷史紀錄排序 (依日期 -> 依訓練模組)
  const sortedPatientLogs = useMemo(() => {
    return [...patientLogs].sort((a, b) => {
      const dateA = new Date(a.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const dateB = new Date(b.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
      
      if (dateA !== dateB) {
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }
      
      const modA = a.training_context?.module_type || '';
      const modB = b.training_context?.module_type || '';
      return modA.localeCompare(modB);
    });
  }, [patientLogs]);

  const closePatientDetails = () => {
    setSelectedPatient(null);
    setPatientLogs([]);
  };

  // 🖨️ PDF 匯出核心邏輯 (直立 A4)
  const handleDownloadPDF = async (elementId: string, filename: string) => {
    setIsPdfGenerating(true);
    try {
      const element = document.getElementById(elementId);
      if (!element) return;
      
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`${filename}.pdf`);
    } catch (err) {
      console.error('PDF 匯出失敗', err);
      alert('PDF 匯出發生錯誤。');
    } finally {
      setIsPdfGenerating(false);
    }
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

        {!selectedDate ? (
          // ==========================================
          // 第一層：日期總覽
          // ==========================================
          <div className="bg-[#1a2233] rounded-2xl border border-[#2a3a5a] overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-5 border-b border-[#2a3a5a] bg-[#121824] flex justify-between items-center">
              <h2 className="text-[20px] font-bold">📅 每日訓練總覽 (點選日期查看當日病患)</h2>
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
                    groupedLogsByDate.map((group: any, index: number) => (
                      <tr key={index} onClick={() => setSelectedDate(group.date)} className="hover:bg-[#2a3241] cursor-pointer transition-colors border-b border-[#2a3a5a]/50">
                        <td className="p-4 font-mono text-[16px] font-bold text-white">{group.date}</td>
                        <td className="p-4 font-bold text-[#00ffcc]">{group.uniquePatients} 人</td>
                        <td className="p-4 font-bold text-[#4D96FF]">{group.logs.length} 筆</td>
                        <td className="p-4 font-bold text-[#E5B55E]">{Math.floor(group.totalSeconds / 60)} 分 {group.totalSeconds % 60} 秒</td>
                        <td className="p-4">
                          {group.tamperedCount === 0 ? <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#00ffcc]/10 text-[#00ffcc] rounded-full text-[13px] font-bold border border-[#00ffcc]/30">✅ 全數合規</span> : <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#ff4d4d]/10 text-[#ff4d4d] rounded-full text-[13px] font-bold border border-[#ff4d4d]/30">🚨 包含 {group.tamperedCount} 筆異常</span>}
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
          // 第二層：單日病患清單
          // ==========================================
          <div className="bg-[#1a2233] rounded-2xl border border-[#2a3a5a] overflow-hidden shadow-2xl animate-fade-in">
            <div className="p-5 border-b border-[#2a3a5a] bg-[#121824] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <button onClick={() => setSelectedDate(null)} className="bg-[#2a3241] hover:bg-[#3a4556] text-white px-4 py-2 rounded-lg text-[14px] font-bold transition flex items-center gap-2">⬅️ 返回日期列表</button>
                <h2 className="text-[20px] font-bold text-[#E5B55E]">📋 {selectedDate} 參與病患日誌 (點選查看明細)</h2>
              </div>
              <button 
                onClick={() => handleDownloadPDF('pdf-layer2', `AuraEyeGym_${selectedDate}_日報表`)}
                disabled={isPdfGenerating}
                className="bg-[#2B579A] hover:bg-[#3B6BB0] text-white px-5 py-2 rounded-lg font-bold flex items-center gap-2 transition"
              >
                {isPdfGenerating ? '處理中...' : '📄 匯出 A4 報表'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#161b22] text-[#8b9bb4] text-[14px] uppercase tracking-wider">
                    <th className="p-4 border-b border-[#2a3a5a]">資料完整性</th>
                    <th className="p-4 border-b border-[#2a3a5a]">病患 LINE 暱稱</th>
                    <th className="p-4 border-b border-[#2a3a5a]">訓練模組完成數</th>
                    <th className="p-4 border-b border-[#2a3a5a]">最後完成時間</th>
                    <th className="p-4 border-b border-[#2a3a5a]">處方/方案</th>
                  </tr>
                </thead>
                <tbody className="text-[15px]">
                  {currentDayPatients.map((pat: any, index: number) => {
                    const timeOnly = new Date(pat.lastCompletionTime).toLocaleTimeString('zh-TW', { hour12: false });
                    return (
                      <tr key={index} onClick={() => openPatientDetails(pat.line_uid, pat.real_name)} className={`hover:bg-[#2a3241] cursor-pointer transition-colors border-b border-[#2a3a5a]/50 ${!pat.isSignatureValid ? 'bg-[#3a1a1a]/40' : ''}`}>
                        <td className="p-4">
                          {pat.isSignatureValid ? <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#00ffcc]/10 text-[#00ffcc] rounded-full text-[13px] font-bold border border-[#00ffcc]/30">✅ 合規</span> : <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#ff4d4d]/10 text-[#ff4d4d] rounded-full text-[13px] font-bold border border-[#ff4d4d]/30">🚨 竄改</span>}
                        </td>
                        <td className="p-4 font-bold text-[#00ffcc] flex items-center gap-2">👤 {pat.real_name}</td>
                        <td className="p-4 font-bold text-[#E5B55E]">{pat.moduleCount} 模組</td>
                        <td className="p-4 font-mono text-[#a5b6cf]">{timeOnly}</td>
                        <td className="p-4 text-[#8b9bb4]">{pat.auth_code === 'FREE-TIER' ? '免費方案' : '🩺 處方授權'}</td>
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
          <div className="bg-[#0f141e] border border-[#00ffcc] rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-[0_0_30px_rgba(0,255,204,0.15)] overflow-hidden">
            <div className="p-5 border-b border-[#2a3a5a] flex justify-between items-center bg-[#162b2b]">
              <div>
                <h2 className="text-[24px] font-bold text-[#00ffcc] flex items-center gap-2">👤 {selectedPatient.name} 專屬依從性追蹤紀錄</h2>
                <p className="text-[#8b9bb4] text-[14px] font-mono mt-1">UID: {selectedPatient.uid}</p>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => handleDownloadPDF('pdf-layer3', `AuraEyeGym_個人報表_${selectedPatient.name}`)}
                  disabled={isPdfGenerating}
                  className="bg-[#2B579A] hover:bg-[#3B6BB0] text-white px-5 py-2 rounded-lg font-bold flex items-center gap-2 transition text-[15px]"
                >
                  {isPdfGenerating ? '處理中...' : '📄 匯出 A4 報表'}
                </button>
                <button onClick={closePatientDetails} className="text-[#8b9bb4] hover:text-[#ff4d4d] transition-colors text-[36px] font-light leading-none">&times;</button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1 bg-[#0f141e]">
              {isPatientLoading ? (
                <div className="flex flex-col items-center justify-center h-64"><div className="text-[40px] mb-4 animate-spin">⏳</div><p className="text-[#00ffcc] font-bold tracking-widest animate-pulse">正在解密病患專屬區塊鏈結...</p></div>
              ) : (
                <div className="bg-[#1a2233] rounded-xl border border-[#2a3a5a] overflow-hidden">
                  <div className="p-4 border-b border-[#2a3a5a] bg-[#121824]"><h3 className="font-bold text-[18px] text-[#fffdd0]">📄 歷史訓練軌跡 (依日期與模組排序)</h3></div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#161b22] text-[#8b9bb4] text-[13px] uppercase tracking-wider">
                          <th className="p-3 border-b border-[#2a3a5a]">日期</th>
                          <th className="p-3 border-b border-[#2a3a5a]">訓練模組</th>
                          <th className="p-3 border-b border-[#2a3a5a]">完成時間</th>
                          <th className="p-3 border-b border-[#2a3a5a]">時長</th>
                          <th className="p-3 border-b border-[#2a3a5a]">異常次數</th>
                          <th className="p-3 border-b border-[#2a3a5a]">該次眨眼率</th>
                          <th className="p-3 border-b border-[#2a3a5a]">合規狀態</th>
                        </tr>
                      </thead>
                      <tbody className="text-[14px]">
                        {sortedPatientLogs.length === 0 ? (
                          <tr><td colSpan={7} className="p-8 text-center text-[#8b9bb4]">沒有找到紀錄</td></tr>
                        ) : (
                          sortedPatientLogs.map((log: any, idx: number) => {
                            const d = new Date(log.created_at);
                            const dateStr = d.toLocaleDateString('zh-TW');
                            const timeStr = d.toLocaleTimeString('zh-TW', { hour12: false });
                            const pauseCount = log.performance_metrics?.pause_count || 0;
                            return (
                              <tr key={idx} className="hover:bg-[#2a3241] border-b border-[#2a3a5a]/50">
                                <td className="p-3 font-mono text-[#a5b6cf]">{dateStr}</td>
                                <td className="p-3 font-bold text-[#E5B55E]">{log.training_context?.module_type || '未記錄'}</td>
                                <td className="p-3 font-mono text-[#a5b6cf]">{timeStr}</td>
                                <td className="p-3 font-mono text-white">{log.performance_metrics?.total_active_seconds || 0} 秒</td>
                                <td className="p-3 font-bold text-[#ff9f1c]">{pauseCount > 0 ? `${pauseCount} 次` : '-'}</td>
                                <td className="p-3 font-bold text-[#4D96FF]">{log.objective_metrics?.blink_rate_per_min ? log.objective_metrics.blink_rate_per_min.toFixed(1) : 0} 次/分</td>
                                <td className="p-3">{log.isSignatureValid ? <span className="text-[#00ffcc] font-bold text-[12px]">✅ 通過</span> : <span className="text-[#ff4d4d] font-bold text-[12px]">🚨 異常</span>}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          隱藏的 A4 PDF 渲染區域 (白底黑字, 微軟正黑體, 14pt)
          ========================================== */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', zIndex: -100 }}>
        {/* 第二層 PDF 內容 */}
        <div id="pdf-layer2" style={{ width: '210mm', minHeight: '297mm', backgroundColor: 'white', color: 'black', padding: '15mm', boxSizing: 'border-box', fontFamily: '"Microsoft JhengHei", sans-serif' }}>
          <h1 style={{ fontSize: '20pt', textAlign: 'center', marginBottom: '5px', fontWeight: 'bold' }}>Aura EyeGym 醫療稽核日報表</h1>
          <p style={{ fontSize: '14pt', textAlign: 'center', marginBottom: '20px' }}>報告日期：{selectedDate}</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14pt' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th style={{ border: '1px solid black', padding: '10px' }}>病患暱稱</th>
                <th style={{ border: '1px solid black', padding: '10px' }}>完成模組數</th>
                <th style={{ border: '1px solid black', padding: '10px' }}>最後完成時間</th>
                <th style={{ border: '1px solid black', padding: '10px' }}>稽核狀態</th>
              </tr>
            </thead>
            <tbody>
              {currentDayPatients.map((pat: any, i: number) => (
                <tr key={i}>
                  <td style={{ border: '1px solid black', padding: '10px' }}>{pat.real_name}</td>
                  <td style={{ border: '1px solid black', padding: '10px', textAlign: 'center' }}>{pat.moduleCount}</td>
                  <td style={{ border: '1px solid black', padding: '10px', textAlign: 'center' }}>{new Date(pat.lastCompletionTime).toLocaleTimeString('zh-TW', { hour12: false })}</td>
                  <td style={{ border: '1px solid black', padding: '10px', textAlign: 'center' }}>{pat.isSignatureValid ? '合規' : '遭竄改'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '12pt', marginTop: '30px', textAlign: 'right', color: '#666' }}>*本報告由 Aura EyeGym 系統自動產生，受 SHA-256 數位簽章保護。</p>
        </div>

        {/* 第三層 PDF 內容 */}
        {selectedPatient && (
          <div id="pdf-layer3" style={{ width: '210mm', minHeight: '297mm', backgroundColor: 'white', color: 'black', padding: '15mm', boxSizing: 'border-box', fontFamily: '"Microsoft JhengHei", sans-serif' }}>
            <h1 style={{ fontSize: '20pt', textAlign: 'center', marginBottom: '5px', fontWeight: 'bold' }}>病患專屬依從性追蹤紀錄</h1>
            <p style={{ fontSize: '14pt', textAlign: 'center', marginBottom: '20px' }}>病患姓名：{selectedPatient.name}</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13pt' }}>
              <thead>
                <tr style={{ backgroundColor: '#f0f0f0' }}>
                  <th style={{ border: '1px solid black', padding: '8px' }}>日期</th>
                  <th style={{ border: '1px solid black', padding: '8px' }}>完成時間</th>
                  <th style={{ border: '1px solid black', padding: '8px' }}>訓練模組</th>
                  <th style={{ border: '1px solid black', padding: '8px' }}>時長</th>
                  <th style={{ border: '1px solid black', padding: '8px' }}>異常次數</th>
                  <th style={{ border: '1px solid black', padding: '8px' }}>眨眼率</th>
                </tr>
              </thead>
              <tbody>
                {sortedPatientLogs.map((log: any, i: number) => {
                  const d = new Date(log.created_at);
                  const pauseCount = log.performance_metrics?.pause_count || 0;
                  return (
                    <tr key={i}>
                      <td style={{ border: '1px solid black', padding: '8px' }}>{d.toLocaleDateString('zh-TW')}</td>
                      <td style={{ border: '1px solid black', padding: '8px' }}>{d.toLocaleTimeString('zh-TW', { hour12: false })}</td>
                      <td style={{ border: '1px solid black', padding: '8px' }}>{log.training_context?.module_type || ''}</td>
                      <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{log.performance_metrics?.total_active_seconds || 0}s</td>
                      <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center', color: pauseCount > 0 ? 'red' : 'black' }}>{pauseCount}</td>
                      <td style={{ border: '1px solid black', padding: '8px', textAlign: 'center' }}>{log.objective_metrics?.blink_rate_per_min ? log.objective_metrics.blink_rate_per_min.toFixed(1) : 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p style={{ fontSize: '12pt', marginTop: '30px', textAlign: 'right', color: '#666' }}>*本報告由 Aura EyeGym 系統自動產生，受 SHA-256 數位簽章保護。</p>
          </div>
        )}
      </div>
    </div>
  );
}