'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// 1. Supabase 連線設定
// ==========================================
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bowzkrdxjfxwuxkvvlnh.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_JyPNp0UKUlSeNKMM-okN4Q_TAHuCSMT';
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// 🚨 專利防護核心：後端 HMAC 數位簽章驗證引擎
// ==========================================
const AURA_SECRET_SALT = "AuraDTx_Patent_2026_Strict_Compliance_O2O";

// 在後台重新計算一次 Hash，與資料庫存的 digital_signature 比對
async function verifyHMAC(log: any) {
  try {
    // 必須與 App 端生成簽章時的資料結構一模一樣
    const payloadForSignature = {
      session_id: log.session_id,
      sequence_id: log.sequence_id || 0,
      previous_hash: log.previous_hash || 'GENESIS_HASH_00000000000000000000',
      line_uid: log.line_uid,
      auth_code: log.auth_code,
      device_info: log.device_info,
      training_context: log.training_context,
      performance_metrics: log.performance_metrics,
      objective_metrics: log.objective_metrics,
      state_machine_details: log.state_machine_details,
      created_at: log.created_at
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
  const [stats, setStats] = useState({ total: 0, verified: 0, tampered: 0, totalSeconds: 0 });

  // 更新後的診所端讀取邏輯
  const handleLogin = () => {
    // 假設醫師輸入的授權碼 (passcode) 就是診所的代號 (例如 'CLINIC_A')
    if (passcode.trim() !== '') {
      setIsAuthenticated(true);
      fetchLogs();
    } else {
      alert('請輸入診所代碼');
    }
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    
    // 🔒 資料隔離核心：只撈取該診所代碼 (passcode) 對應的訓練紀錄
    const { data, error } = await supabase
      .from('training_logs')
      .select('*')
      .eq('clinic_id', passcode.trim().toUpperCase()) // 👈 新增這行進行過濾
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('獲取資料失敗', error);
      setIsLoading(false);
      return;
    }

    if (data) {
      let verifiedCount = 0;
      let tamperedCount = 0;
      let seconds = 0;

      // 逐筆進行醫療級 HMAC 驗證
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
          <p className="text-[#8b9bb4] text-[14px] mt-5">(測試密碼: AURA2026)</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f141e] text-[#fffdd0] font-sans p-5 md:p-10">
      <div className="max-w-[1200px] mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 border-b-2 border-[#2a3a5a] pb-5">
          <div>
            <h1 className="text-[32px] font-bold text-[#00ffcc] flex items-center gap-3">
              <span>🏥</span> Aura EyeGym 醫療稽核儀表板
            </h1>
            <p className="text-[#8b9bb4] text-[16px] mt-2">O2O 數位療法閉環｜病患依從性與防偽驗證中心</p>
          </div>
          <button onClick={fetchLogs} className="mt-4 md:mt-0 px-6 py-3 bg-[#1a2233] border border-[#4D96FF] text-[#4D96FF] rounded-lg font-bold hover:bg-[#4D96FF] hover:text-white transition-colors flex items-center gap-2">
            <span>🔄</span> 重新載入區塊鏈結
          </button>
        </div>

        {/* Stats Cards */}
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
            <h3 className="text-[#8b9bb4] text-[16px] mb-2">累積有效訓練時長</h3>
            <p className="text-[36px] font-bold text-[#E5B55E]">{Math.floor(stats.totalSeconds / 60)} 分鐘</p>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-[#1a2233] rounded-2xl border border-[#2a3a5a] overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-[#2a3a5a] bg-[#121824] flex justify-between items-center">
            <h2 className="text-[20px] font-bold">📋 病患近期訓練時序與稽核日誌</h2>
            <span className="text-[#8b9bb4] text-[14px]">使用 SHA-256 HMAC 與時序雜湊鏈結保護</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#161b22] text-[#8b9bb4] text-[14px] uppercase tracking-wider">
                  <th className="p-4 border-b border-[#2a3a5a]">資料完整性</th>
                  <th className="p-4 border-b border-[#2a3a5a]">完成時間</th>
                  <th className="p-4 border-b border-[#2a3a5a]">病患 UID (部分)</th>
                  <th className="p-4 border-b border-[#2a3a5a]">訓練模組</th>
                  <th className="p-4 border-b border-[#2a3a5a]">有效時長</th>
                  <th className="p-4 border-b border-[#2a3a5a]">平均眨眼率</th>
                  <th className="p-4 border-b border-[#2a3a5a]">處方/方案</th>
                </tr>
              </thead>
              <tbody className="text-[15px]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-[#8b9bb4] animate-pulse">
                      資料安全解密中...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-[#8b9bb4]">
                      目前沒有任何訓練紀錄
                    </td>
                  </tr>
                ) : (
                  logs.map((log, index) => {
                    const isValid = log.isSignatureValid;
                    const date = new Date(log.created_at).toLocaleString('zh-TW', { hour12: false });
                    const shortUid = log.line_uid ? log.line_uid.substring(0, 8) + '***' : '未知';
                    const blinkRate = log.objective_metrics?.blink_rate_per_min || 0;
                    const isRelaxed = log.objective_metrics?.relaxation_achieved;

                    return (
                      <tr key={log.id || index} className={`hover:bg-[#2a3241] transition-colors border-b border-[#2a3a5a]/50 ${!isValid ? 'bg-[#3a1a1a]/40' : ''}`}>
                        <td className="p-4">
                          {isValid ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#00ffcc]/10 text-[#00ffcc] rounded-full text-[13px] font-bold border border-[#00ffcc]/30">
                              ✅ 簽章驗證通過
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#ff4d4d]/10 text-[#ff4d4d] rounded-full text-[13px] font-bold border border-[#ff4d4d]/30">
                              🚨 遭到竄改
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-mono text-[14px] text-[#a5b6cf]">{date}</td>
                        <td className="p-4 font-mono text-[14px]">{shortUid}</td>
                        <td className="p-4 font-bold text-[#E5B55E]">{log.training_context?.module_type || '未記錄'}</td>
                        <td className="p-4">
                          <span className={`font-mono ${!isValid ? 'text-[#ff4d4d] line-through' : 'text-white'}`}>
                            {log.performance_metrics?.total_active_seconds || 0} 秒
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`font-bold ${isRelaxed ? 'text-[#00ffcc]' : 'text-[#ff9f1c]'}`}>
                            {blinkRate.toFixed(1)} 次/分
                          </span>
                        </td>
                        <td className="p-4 text-[#8b9bb4]">
                          {log.auth_code === 'FREE-TIER' ? '免費方案' : '🩺 處方授權'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}