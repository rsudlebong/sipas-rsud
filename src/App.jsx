import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Trash2, Copy, Save, Calendar, Users, Home, Heart, Settings, 
  Activity, ArrowLeft, AlertCircle, CheckCircle, List,
  ChevronRight, Plus, X, Lock, Unlock, LogOut,
  BarChart3, UserCog, LayoutDashboard, ClipboardList, Edit3, Loader2, Baby, ShieldPlus,
  Stethoscope, Zap, Bell, Scissors, Droplets, RefreshCw, KeyRound, AlertTriangle, ShieldCheck, Database
} from 'lucide-react';

// --- IMPOR FIREBASE ---
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, 
  onSnapshot, query, setDoc, getDoc
} from "firebase/firestore";
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from "firebase/auth";

// --- KONFIGURASI FIREBASE ANDA (TERBARU) ---
const firebaseConfig = {
  apiKey: "AIzaSyCaHD5UUYK2YXEDRW2ICGJE9M6Wy57ZBGo",
  authDomain: "sipas-rsud-lebong-e6a43.firebaseapp.com",
  projectId: "sipas-rsud-lebong-e6a43",
  storageBucket: "sipas-rsud-lebong-e6a43.firebasestorage.app",
  messagingSenderId: "477611720744",
  appId: "1:477611720744:web:743147bc25512317caf51d",
  measurementId: "G-RNJQHZQQ50"
};

// --- INISIALISASI FIREBASE ---
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

const appId = 'sipas-lebong-prod-v1';

// --- HELPERS ---
const getReportingDate = () => {
  const now = new Date();
  if (now.getHours() < 7) now.setDate(now.getDate() - 1);
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const initialReportData = {
  date: getReportingDate(),
  igdPagi: 0, igdSore: 0, igdMalam: 0,
  igdPonekPagi: 0, igdPonekSore: 0, igdPonekMalam: 0,
  okObgynElektif: 0, okObgynCito: 0,
  okBedahElektif: 0, okBedahCito: 0,
  hdMesin: 4, hdPagi: 0, hdSiang: 0, hdCito: 0,
};

const iconMap = { 
  'Heart': Heart, 'Home': Home, 'Activity': Activity, 'Zap': Zap, 
  'Users': Users, 'Baby': Baby, 'ShieldPlus': ShieldPlus, 'Stethoscope': Stethoscope
};

const defaultRoomsList = [
  { id: 'HCU', name: 'HCU', defaultTT: 6, icon: 'ShieldPlus', ttKey: 'HCUTT', pasienKey: 'HCUPasien', bpjsKey: 'HCUBpjs', umumKey: 'HCUUmum', cardGradient: 'bg-gradient-to-br from-indigo-400 to-violet-500', inputBg: 'bg-white/20' },
  { id: 'PERINA', name: 'NICU - PERINA', defaultTT: 6, icon: 'Baby', ttKey: 'PERINATT', pasienKey: 'PERINAPasien', bpjsKey: 'PERINABpjs', umumKey: 'PERINAUmum', cardGradient: 'bg-gradient-to-br from-teal-400 to-emerald-500', inputBg: 'bg-white/20', isPerina: true },
  { id: 'ANAK', name: 'Ranap Anak', defaultTT: 23, icon: 'Baby', ttKey: 'ANAKTT', pasienKey: 'ANAKPasien', bpjsKey: 'ANAKBpjs', umumKey: 'ANAKUmum', cardGradient: 'bg-gradient-to-br from-amber-400 to-orange-500', inputBg: 'bg-white/20' },
  { id: 'BEDAH', name: 'Ranap Bedah', defaultTT: 23, icon: 'Activity', ttKey: 'BEDAHTT', pasienKey: 'BEDAHPasien', bpjsKey: 'BEDAHBpjs', umumKey: 'BEDAHUmum', cardGradient: 'bg-gradient-to-br from-cyan-400 to-sky-500', inputBg: 'bg-white/20' },
  { id: 'INTERNA', name: 'Penyakit Dalam', defaultTT: 24, icon: 'Stethoscope', ttKey: 'INTERNATT', pasienKey: 'INTERNAPasien', bpjsKey: 'INTERNABpjs', umumKey: 'INTERNAUmum', cardGradient: 'bg-gradient-to-br from-blue-500 to-indigo-600', inputBg: 'bg-white/20' },
  { id: 'KOHORT', name: 'Kohort', defaultTT: 10, icon: 'Users', ttKey: 'KOHORTTT', pasienKey: 'KOHORTPasien', bpjsKey: 'KOHORTBpjs', umumKey: 'KOHORTUmum', cardGradient: 'bg-gradient-to-br from-slate-400 to-slate-500', inputBg: 'bg-white/20' },
  { id: 'VIP', name: 'Ranap VIP', defaultTT: 7, icon: 'Zap', ttKey: 'VIPTT', pasienKey: 'VIPPasien', bpjsKey: 'VIPBpjs', umumKey: 'VIPUmum', cardGradient: 'bg-gradient-to-br from-fuchsia-400 to-pink-500', inputBg: 'bg-white/20' },
  { id: 'KEBIDANAN', name: 'Kebidanan', defaultTT: 16, icon: 'Heart', ttKey: 'VKTT', pasienKey: 'VKPasien', bpjsKey: 'VKBpjs', umumKey: 'VKUmum', cardGradient: 'bg-gradient-to-br from-rose-400 to-pink-500', inputBg: 'bg-white/20' },
  { id: 'PICU', name: 'PICU', defaultTT: 8, icon: 'ShieldPlus', ttKey: 'PICUTT', pasienKey: 'PICUPasien', bpjsKey: 'PICUBpjs', umumKey: 'PICUUmum', cardGradient: 'bg-gradient-to-br from-purple-500 to-violet-600', inputBg: 'bg-white/20' },
];

const copyToClipboard = (text, onSuccess) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        if (onSuccess) onSuccess();
    } catch (err) { console.error(err); }
    document.body.removeChild(textArea);
};

const formatReportText = (data, rooms) => {
  const dateStr = new Date(data.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  let text = `*LAPORAN PASIEN RSUD LEBONG*\nTgl: ${dateStr}\n\n`;
  text += `*UNIT IGD*\nPagi : ${data.igdPagi || 0}\nSore : ${data.igdSore || 0}\nMalam : ${data.igdMalam || 0}\n\n`;
  const totalRawat = rooms.reduce((acc, r) => acc + Number(data[r.pasienKey] || 0), 0);
  rooms.forEach(room => {
    text += `*${room.name}*\nTT : ${data[room.ttKey] || room.defaultTT}\nPasien : ${data[room.pasienKey] || 0}\nBPJS : ${data[room.bpjsKey] || 0}\nUmum : ${data[room.umumKey] || 0}\n\n`;
  });
  text += `*Total Rawat Inap:* ${totalRawat}\n\n*UNIT HD*\nPagi: ${data.hdPagi || 0}\nSiang: ${data.hdSiang || 0}\nCito: ${data.hdCito || 0}`;
  return text;
};

// --- KOMPONEN UI ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="fixed top-4 left-4 right-4 md:right-10 md:left-auto md:w-96 z-[600] animate-in slide-in-from-top-4 fade-in">
      <div className={`mx-auto w-full rounded-2xl px-6 py-4 shadow-2xl flex items-center space-x-3 backdrop-blur-xl border border-white/20 text-slate-800 ${type === 'success' ? 'bg-emerald-100/90' : 'bg-red-100/90'}`}>
        {type === 'success' ? <CheckCircle className="text-emerald-600" /> : <AlertTriangle className="text-red-600" />}
        <span className="text-sm font-bold">{message}</span>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, subtext, gradient }) => (
  <div className={`p-5 rounded-[24px] ${gradient} shadow-lg text-white relative overflow-hidden transition-all hover:scale-[1.02]`}>
    <div className="absolute top-0 right-0 p-4 opacity-10"><Activity size={48}/></div>
    <h4 className="text-[10px] uppercase font-black opacity-60 mb-1">{label}</h4>
    <div className="text-3xl font-black">{value}</div>
    {subtext && <div className="text-[10px] font-bold opacity-80 mt-2 bg-white/10 w-fit px-2 py-1 rounded-lg">{subtext}</div>}
  </div>
);

const NumberInput = ({ label, value, onChange, bgClass = "bg-white/20", textColor="text-white" }) => (
  <div className="flex flex-col">
    <label className={`text-[10px] font-bold ${textColor}/80 uppercase mb-1 truncate`}>{label}</label>
    <input 
      type="number" min="0" onFocus={(e) => e.target.select()}
      className={`w-full ${bgClass} border-0 rounded-xl py-2 px-2 text-center font-black ${textColor} outline-none focus:ring-2 focus:ring-blue-500/50 text-xs shadow-inner`}
      value={value || 0} 
      onChange={(e) => onChange(parseInt(e.target.value) || 0)} 
    />
  </div>
);

const RoomCard = React.memo(({ room, report, onChange, isAdmin, onDeleteRoom }) => {
    const Icon = iconMap[room.icon] || Home;
    return (
        <div className={`${room.cardGradient} rounded-[32px] p-5 shadow-lg relative overflow-hidden transition-all hover:scale-[1.02] h-full flex flex-col justify-between`}>
            <div className="flex justify-between items-center mb-4 relative z-10 text-white">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md shadow-inner"><Icon size={20} /></div>
                    <div>
                        <h3 className="text-xs font-black uppercase truncate tracking-tighter">{room.name}</h3>
                        <p className="text-[10px] font-bold opacity-80">TT: {report[room.ttKey] || room.defaultTT}</p>
                    </div>
                </div>
                {isAdmin && <button onClick={() => onDeleteRoom(room.id)} className="p-2 bg-white/20 text-white rounded-xl hover:bg-red-500/80 transition-colors"><Trash2 size={16} /></button>}
            </div>
            <div className="grid grid-cols-4 gap-1.5 bg-black/5 p-3 rounded-[24px] backdrop-blur-sm relative z-10 border border-white/5">
                <NumberInput label="TT" value={report[room.ttKey] || room.defaultTT} onChange={(val) => onChange(room.ttKey, val)} bgClass="bg-indigo-500/30" />
                <NumberInput label="PASIEN" value={report[room.pasienKey]} onChange={(val) => onChange(room.pasienKey, val)} bgClass={room.inputBg} />
                <NumberInput label="BPJS" value={report[room.bpjsKey]} onChange={(val) => onChange(room.bpjsKey, val)} bgClass={room.inputBg} />
                <NumberInput label="UMUM" value={report[room.umumKey]} onChange={(val) => onChange(room.umumKey, val)} bgClass={room.inputBg} />
            </div>
        </div>
    );
});

// --- KOMPONEN UTAMA ---
const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [report, setReport] = useState(initialReportData);
  const [rooms, setRooms] = useState(defaultRoomsList);
  const [savedReports, setSavedReports] = useState([]);
  const [toast, setToast] = useState(null); 
  const [user, setUser] = useState(null);
  const [dbStatus, setDbStatus] = useState('connecting'); 
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaffLoggedIn, setIsStaffLoggedIn] = useState(false);
  const [authSettings, setAuthSettings] = useState({ staffPassword: '123', adminUsername: 'admin', adminPassword: '123' });
  
  const [showStaffLogin, setShowStaffLogin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [staffPassInput, setStaffPassInput] = useState('');
  const [adminUserInput, setAdminUserInput] = useState('');
  const [adminPassInput, setAdminPassInput] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [newRoomData, setNewRoomData] = useState({ name: '', id: '', hasUmum: true });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: '', id: '', message: '' });

  const showToast = (msg, type = 'success') => setToast({ message: msg, type });

  // 1. Inisialisasi Auth
  useEffect(() => {
    const initAuth = async () => {
      setDbStatus('connecting');
      try {
        await signInAnonymously(auth);
      } catch (e) { 
        console.error("Auth Fail:", e);
        setDbStatus('offline');
        showToast("Login Gagal. Pastikan 'Anonymous Auth' aktif di Firebase!", "error"); 
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => {
        if (u) { setUser(u); setDbStatus('online'); }
        else setDbStatus('offline');
    });
  }, []);

  // 2. Data Fetching
  useEffect(() => {
    if (!user) return;

    const unsubAuth = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'auth'), (snap) => {
      if (snap.exists()) setAuthSettings(snap.data());
      else setDoc(snap.ref, { staffPassword: '123', adminUsername: 'admin', adminPassword: '123' });
    });

    const unsubRooms = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'rooms'), (snap) => {
      if (!snap.empty) setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubReports = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'reports'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sorted = data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setSavedReports(sorted);
      
      const currentReportingDate = getReportingDate();
      const currentData = sorted.find(r => r.date === currentReportingDate);
      if (currentData) setReport(prev => ({ ...prev, ...currentData }));
      else setReport({ ...initialReportData, date: currentReportingDate });
    });

    return () => { unsubAuth(); unsubRooms(); unsubReports(); };
  }, [user]);

  // --- ACTIONS ---
  const handleSaveReport = async (dataToSave = report) => {
    if (!user) return showToast("Tidak ada koneksi", "error");
    const existing = savedReports.find(r => r.date === dataToSave.date);
    try {
      if (existing) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reports', existing.id), { ...dataToSave, updatedAt: Date.now() });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'reports'), { ...dataToSave, createdAt: Date.now() });
      }
      showToast("Laporan Berhasil Disimpan!");
      setEditingId(null);
      if (activeTab === 'input') setActiveTab('dashboard');
    } catch (e) { showToast("Gagal simpan ke Firebase", "error"); }
  };

  const deleteAction = async () => {
    if (!user || !confirmModal.id) return;
    try {
      const coll = confirmModal.type === 'report' ? 'reports' : 'rooms';
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', coll, confirmModal.id));
      showToast("Data Berhasil Dihapus");
      setConfirmModal({ isOpen: false });
    } catch (e) { showToast("Gagal menghapus", "error"); }
  };

  const updateCredentials = async (data) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'auth'), data);
    showToast("Password diperbarui");
  };

  const handleAddRoom = async () => {
    if (!newRoomData.name || !newRoomData.id) return;
    const cid = newRoomData.id.toUpperCase().replace(/\s/g, '');
    const room = {
      id: cid, name: newRoomData.name, icon: 'Home', defaultTT: 20,
      ttKey: `${cid}TT`, pasienKey: `${cid}Pasien`, bpjsKey: `${cid}Bpjs`,
      umumKey: newRoomData.hasUmum ? `${cid}Umum` : null,
      cardGradient: 'bg-gradient-to-br from-slate-500 to-slate-600', inputBg: 'bg-white/20'
    };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', cid), room);
    setNewRoomData({ name: '', id: '', hasUmum: true });
    showToast("Ruangan ditambahkan");
  };

  const missingRooms = useMemo(() => rooms.filter(r => Number(report[r.pasienKey] || 0) === 0), [rooms, report]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, activeIconBg: 'bg-gradient-to-tr from-indigo-500 to-violet-500' },
    { id: 'input', label: 'Input Data', icon: LayoutDashboard, activeIconBg: 'bg-gradient-to-tr from-blue-500 to-sky-400' },
    { id: 'preview', label: 'Salin Teks', icon: Copy, activeIconBg: 'bg-gradient-to-tr from-violet-600 to-purple-400' },
  ];
  if (isAdmin) {
    navItems.push({ id: 'history', label: 'Arsip Data', icon: ClipboardList, activeIconBg: 'bg-gradient-to-tr from-emerald-600 to-teal-400' });
    navItems.push({ id: 'settings', label: 'Setting', icon: Settings, activeIconBg: 'bg-gradient-to-tr from-slate-600 to-zinc-400' });
  }

  // --- RENDERS ---
  const renderDashboard = () => {
    const totalPatients = rooms.reduce((acc, r) => acc + Number(report[r.pasienKey] || 0), 0);
    const totalTT = rooms.reduce((acc, r) => acc + Number(report[r.ttKey] || r.defaultTT || 0), 0);
    const totalBor = totalTT > 0 ? (totalPatients / totalTT) * 100 : 0;
    
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {missingRooms.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-[32px] p-6 pulse-red">
            <div className="flex items-center gap-3 mb-4 text-red-600"><AlertTriangle size={24} /><h3 className="text-sm font-black uppercase tracking-widest">Alarm: Belum Lapor</h3></div>
            <div className="flex flex-wrap gap-2">
              {missingRooms.map(r => (
                <span key={r.id} className="bg-white text-red-600 border border-red-100 px-3 py-2 rounded-full text-[10px] font-black uppercase shadow-sm flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
            <Activity className="absolute -right-10 -bottom-10 opacity-10 w-64 h-64" />
            <h2 className="text-xs font-black text-white/70 uppercase mb-2 tracking-widest">Total Pasien Rawat Inap</h2>
            <div className="flex items-end space-x-2"><span className="text-6xl font-black tracking-tighter">{totalPatients}</span><span className="text-lg font-bold opacity-80 mb-2">Pasien</span></div>
            <div className="mt-6 bg-black/20 rounded-full h-2 w-full overflow-hidden"><div className="bg-white h-full rounded-full transition-all duration-1000" style={{width: `${Math.min(totalBor, 100)}%`}}></div></div>
            <div className="flex justify-between mt-2 text-[10px] font-bold text-white/80 uppercase"><span>BOR RSUD LEBONG</span><span>{totalBor.toFixed(1)}%</span></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
            <StatCard label="Tgl Laporan" value={new Date(report.date).toLocaleDateString('id-ID', {day:'numeric', month:'short'})} subtext="Reset jam 07:00" gradient="bg-gradient-to-br from-sky-400 to-blue-500" />
            <StatCard label="Input Status" value={`${rooms.length - missingRooms.length}/${rooms.length}`} subtext="Ruangan Terisi" gradient="bg-gradient-to-br from-emerald-400 to-teal-500" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pb-12">
          {rooms.map(r => {
            const filled = Number(report[r.pasienKey] || 0) > 0;
            const pct = Number(report[r.pasienKey] || 0) / Number(report[r.ttKey] || r.defaultTT || 1) * 100;
            return (
              <div key={r.id} className={`bg-white p-4 rounded-[24px] border flex items-center space-x-4 shadow-sm ${filled ? 'border-indigo-100' : 'opacity-60'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] text-white ${filled ? (r.cardGradient || 'bg-blue-500') : 'bg-slate-200'}`}>{filled ? `${pct.toFixed(0)}%` : '0%'}</div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between mb-1"><span className="text-[10px] font-black uppercase truncate text-slate-700">{r.name}</span><span className={`text-[9px] font-black ${filled ? 'text-emerald-600' : 'text-slate-400'}`}>{filled ? 'OK' : 'WAIT'}</span></div>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden"><div className={`${filled ? 'bg-indigo-600' : 'bg-slate-300'} h-full transition-all duration-1000`} style={{width: `${Math.min(pct, 100)}%`}}></div></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const animationStyles = `
    .pulse-red { animation: pulseRed 2s infinite; }
    @keyframes pulseRed { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
    .h-dvh { height: 100dvh; }
  `;

  return (
    <>
    <style>{animationStyles}</style>
    <div className="flex h-dvh md:h-screen w-full bg-slate-50 font-sans flex-col md:flex-row overflow-hidden text-slate-800">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      {/* MODAL KONFIRMASI */}
      {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[400] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6">
              <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl text-center border">
                  <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 mx-auto mb-6"><AlertTriangle size={32}/></div>
                  <h3 className="text-xl font-black uppercase tracking-tighter mb-2">Hapus Data?</h3>
                  <p className="text-xs text-slate-400 font-bold mb-8 leading-relaxed">{confirmModal.message}</p>
                  <div className="flex gap-4">
                      <button onClick={() => setConfirmModal({isOpen:false})} className="flex-1 p-4 bg-slate-100 rounded-2xl font-black uppercase text-[10px]">Batal</button>
                      <button onClick={deleteAction} className="flex-1 p-4 bg-red-500 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg">Ya, Hapus</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL LOGIN STAFF */}
      {showStaffLogin && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl relative">
            <button onClick={() => setShowStaffLogin(false)} className="absolute top-6 right-6 text-slate-300"><X/></button>
            <div className="flex flex-col items-center mb-8 text-center">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 mb-4 shadow-inner"><KeyRound size={32}/></div>
              <h3 className="text-xl font-black uppercase tracking-tighter">Login Ruangan</h3>
              <p className="text-[10px] text-slate-400 font-bold">Masukkan sandi ruangan untuk input</p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (staffPassInput === authSettings.staffPassword) { setIsStaffLoggedIn(true); setShowStaffLogin(false); setActiveTab('input'); }
              else showToast("Password Salah!", "error");
              setStaffPassInput('');
            }} className="space-y-4">
              <input type="password" placeholder="Password" className="w-full bg-slate-100 rounded-2xl p-5 font-black text-center outline-none focus:ring-4 focus:ring-indigo-100" value={staffPassInput} onChange={e => setStaffPassInput(e.target.value)} autoFocus />
              <button type="submit" className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-black uppercase text-xs shadow-xl">Masuk</button>
            </form>
          </div>
        </div>
      )}

      {/* SIDEBAR (DESKTOP) */}
      <aside className="hidden md:flex w-64 lg:w-72 flex-col bg-white border-r h-full shrink-0">
          <div className="p-8 pb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Activity size={24}/></div>
                <h1 className="text-xl font-black tracking-tighter uppercase leading-none">SIPAS<br/><span className="text-indigo-600">LEBONG</span></h1>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dashboard Monitoring</p>
          </div>
          <nav className="flex-1 px-4 py-8 space-y-3">
              {navItems.map((item) => (
                <button key={item.id} onClick={() => (item.id === 'input' && !isStaffLoggedIn && !isAdmin) ? setShowStaffLogin(true) : setActiveTab(item.id)} className={`w-full flex items-center p-3.5 rounded-[24px] transition-all ${activeTab === item.id ? 'bg-slate-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3.5 ${activeTab === item.id ? `${item.activeIconBg} text-white shadow-lg` : 'bg-slate-100 text-slate-400'}`}><item.icon size={20} /></div>
                    <span className={`text-sm font-bold uppercase tracking-wide`}>{item.label}</span>
                </button>
              ))}
              <div className="pt-8 border-t mx-2">
                <button onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminLogin(true)} className={`w-full flex items-center p-3.5 rounded-[24px] transition-all ${isAdmin ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-3.5 ${isAdmin ? 'bg-slate-700' : 'bg-slate-100'}`}>{isAdmin ? <Unlock size={20}/> : <Lock size={20}/>}</div>
                  <span className="text-xs font-black uppercase tracking-widest">{isAdmin ? 'Log Out Admin' : 'Admin Area'}</span>
                </button>
              </div>
          </nav>
      </aside>

      {/* DOCK BAR (MOBILE) */}
      <nav className="fixed bottom-0 left-0 right-0 z-[200] md:hidden bg-white/90 backdrop-blur-xl border-t py-3 px-4 shadow-2xl flex justify-around items-center">
          {navItems.map((item) => (
            <button key={item.id} onClick={() => (item.id === 'input' && !isStaffLoggedIn && !isAdmin) ? setShowStaffLogin(true) : setActiveTab(item.id)} className={`flex flex-col items-center p-2 transition-all ${activeTab === item.id ? 'scale-110' : 'opacity-50'}`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-1 transition-all ${activeTab === item.id ? `${item.activeIconBg} text-white shadow-lg` : 'bg-slate-100 text-slate-500'}`}><item.icon size={22} /></div>
                <span className={`text-[8px] font-black uppercase tracking-tighter ${activeTab === item.id ? 'text-slate-800' : 'text-slate-500'}`}>{item.label.split(' ')[0]}</span>
            </button>
          ))}
          <button onClick={() => isAdmin ? setIsAdmin(false) : setShowAdminLogin(true)} className={`flex flex-col items-center p-2 transition-all ${isAdmin ? 'scale-110' : 'opacity-50'}`}>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-1 transition-all ${isAdmin ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-100 text-slate-500'}`}>{isAdmin ? <Unlock size={22}/> : <Lock size={22}/>}</div>
              <span className="text-[8px] font-black uppercase tracking-tighter">Admin</span>
          </button>
      </nav>

      {/* AREA KONTEN UTAMA */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="px-6 py-5 flex justify-between items-center bg-white md:hidden border-b">
           <div className="flex items-center gap-2 text-indigo-600 font-black tracking-tighter uppercase text-lg"><Activity size={20}/> SIPAS</div>
           <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${dbStatus === 'online' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>{dbStatus}</div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-10 pb-32">
          <div className="max-w-7xl mx-auto w-full h-full">
            {activeTab === 'dashboard' && renderDashboard()}

            {activeTab === 'input' && (
              <div className="space-y-6 animate-in slide-in-from-right duration-500">
                <div className="bg-white rounded-[32px] p-6 shadow-sm border flex flex-col md:flex-row justify-between items-center gap-4">
                  <div><h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pilih Tanggal</h2><p className="text-2xl font-black">{new Date(report.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
                  <input type="date" value={report.date} onChange={e => setReport({...report, date: e.target.value})} className="bg-slate-50 p-3 rounded-xl text-sm font-bold border outline-none text-slate-700"/>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div className="bg-gradient-to-br from-sky-400 to-blue-500 rounded-[32px] p-6 text-white shadow-xl">
                      <h4 className="text-[10px] font-black uppercase mb-4 opacity-70 tracking-widest">Unit IGD (Pasien Baru)</h4>
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        <NumberInput label="PAGI" value={report.igdPagi} onChange={v => setReport({...report, igdPagi: v})} />
                        <NumberInput label="SORE" value={report.igdSore} onChange={v => setReport({...report, igdSore: v})} />
                        <NumberInput label="MALAM" value={report.igdMalam} onChange={v => setReport({...report, igdMalam: v})} />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <NumberInput label="PONEK P" value={report.igdPonekPagi} onChange={v => setReport({...report, igdPonekPagi: v})} />
                        <NumberInput label="PONEK S" value={report.igdPonekSore} onChange={v => setReport({...report, igdPonekSore: v})} />
                        <NumberInput label="PONEK M" value={report.igdPonekMalam} onChange={v => setReport({...report, igdPonekMalam: v})} />
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-rose-400 to-pink-500 rounded-[32px] p-6 text-white shadow-xl">
                        <h4 className="text-[10px] font-black uppercase mb-4 opacity-70 tracking-widest">Unit Hemodialisa</h4>
                        <div className="grid grid-cols-3 gap-3">
                            <NumberInput label="PAGI" value={report.hdPagi} onChange={v => setReport({...report, hdPagi: v})} />
                            <NumberInput label="SIANG" value={report.hdSiang} onChange={v => setReport({...report, hdSiang: v})} />
                            <NumberInput label="CITO" value={report.hdCito} onChange={v => setReport({...report, hdCito: v})} />
                        </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{rooms.map(room => <RoomCard key={room.id} room={room} report={report} onChange={(k, v) => setReport(p => ({...p, [k]: v}))} isAdmin={isAdmin} />)}</div>
                </div>
                <div className="fixed bottom-24 md:bottom-8 left-0 right-0 flex justify-center z-50 px-4">
                  <button onClick={() => handleSaveReport()} className="w-full md:w-80 bg-blue-600 text-white p-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-2xl active:scale-95 transition-all border-4 border-white/20">
                    <Save size={24} /> Simpan Laporan
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="h-full flex flex-col md:flex-row gap-6 animate-in slide-in-from-right duration-500 pb-32">
                <div className="flex-1 bg-white rounded-[32px] p-8 text-slate-700 font-mono text-xs overflow-y-auto shadow-xl border whitespace-pre-wrap leading-relaxed">{formatReportText(report, rooms)}</div>
                <button onClick={() => { copyToClipboard(formatReportText(report, rooms), () => showToast("Teks Berhasil Disalin!")); }} className="bg-indigo-600 text-white p-8 rounded-[32px] font-black uppercase text-xs flex flex-col items-center justify-center gap-4 shadow-2xl active:scale-95 transition-all md:w-48"><Copy size={48}/> Salin Teks</button>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-4 animate-in slide-in-from-right duration-500 pb-32">
                <div className="bg-white p-6 rounded-[32px] mb-6 border shadow-sm flex justify-between items-center"><h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Arsip Laporan</h2><ClipboardList size={32} className="text-indigo-500 opacity-20"/></div>
                <div className="grid gap-4">
                  {savedReports.map(item => (
                    <div key={item.id} className="bg-white p-6 rounded-[24px] shadow-sm border flex flex-col md:flex-row justify-between items-center gap-4 hover:border-indigo-200 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-400 font-black">{new Date(item.date).getDate()}</div>
                        <div><h4 className="font-black text-slate-800 uppercase text-sm">{new Date(item.date).toLocaleDateString('id-ID', {month:'long', year:'numeric'})}</h4><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest opacity-60">Input pada: {new Date(item.createdAt).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</p></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditFormData(item); setEditingId(item.id); }} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"><Edit3 size={20}/></button>
                        <button onClick={() => setConfirmModal({ isOpen: true, type: 'report', id: item.id, message: 'Hapus data laporan ini secara permanen?' })} className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"><Trash2 size={20}/></button>
                        <button onClick={() => { copyToClipboard(formatReportText(item, rooms), () => showToast("Disalin!")); }} className="px-6 py-3 bg-slate-800 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all shadow-sm">Salin</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-8 animate-in slide-in-from-right duration-500 pb-32">
                <div className="bg-white p-8 rounded-[32px] shadow-xl border">
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-6 flex items-center gap-2 text-indigo-600"><KeyRound size={24}/> Keamanan Akses</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Password Ruangan (Staff)</h5>
                      <input type="text" className="w-full bg-slate-50 rounded-xl p-4 font-bold text-sm outline-none border focus:border-indigo-400 text-slate-700" value={authSettings.staffPassword} onChange={e => setAuthSettings({...authSettings, staffPassword: e.target.value})} />
                      <button onClick={() => updateCredentials(authSettings)} className="w-full bg-slate-800 text-white p-3 rounded-xl font-black uppercase text-[10px] active:scale-95 shadow-lg">Simpan Sandi Staff</button>
                    </div>
                    <div className="space-y-3">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Identitas Admin</h5>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" className="w-full bg-slate-50 rounded-xl p-4 font-bold text-sm outline-none border text-slate-700" value={authSettings.adminUsername} onChange={e => setAuthSettings({...authSettings, adminUsername: e.target.value})} />
                        <input type="password" className="w-full bg-slate-100 rounded-2xl p-4 font-bold outline-none border text-slate-700" value={authSettings.adminPassword} onChange={e => setAuthSettings({...authSettings, adminPassword: e.target.value})} />
                      </div>
                      <button onClick={() => updateCredentials(authSettings)} className="w-full bg-indigo-600 text-white p-3 rounded-xl font-black uppercase text-[10px] active:scale-95 shadow-lg">Update Admin</button>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-8 rounded-[32px] shadow-xl border border-emerald-100">
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-6 flex items-center gap-2 text-emerald-500"><Plus size={24}/> Daftar Ruangan</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tambah Ruangan Baru</h5>
                      <input placeholder="Nama Ruangan" className="w-full bg-slate-50 rounded-xl p-4 font-bold outline-none border text-slate-700" value={newRoomData.name} onChange={e => setNewRoomData({...newRoomData, name: e.target.value})} />
                      <input placeholder="ID SINGKAT (EX: VK)" className="w-full bg-slate-50 rounded-xl p-4 font-bold outline-none uppercase border text-slate-700" value={newRoomData.id} onChange={e => setNewRoomData({...newRoomData, id: e.target.value})} />
                      <div className="flex items-center gap-2 px-2"><input type="checkbox" checked={newRoomData.hasUmum} onChange={e => setNewRoomData({...newRoomData, hasUmum: e.target.checked})} className="w-5 h-5 rounded" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sertakan Input Umum?</span></div>
                      <button onClick={handleAddRoom} className="w-full bg-emerald-500 text-white p-4 rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 transition-transform">Simpan Ruangan</button>
                    </div>
                    <div className="lg:col-span-2 space-y-3 overflow-y-auto max-h-[500px] pr-2 shadow-inner p-4 bg-slate-50 rounded-3xl">
                        {rooms.map(r => (
                         <div key={r.id} className="bg-white p-4 rounded-2xl border flex justify-between items-center group hover:border-indigo-200 shadow-sm">
                           <div><span className="text-sm font-black text-slate-700 uppercase tracking-widest">{r.name}</span><p className="text-[8px] text-slate-400 font-bold uppercase opacity-50">KODE: {r.id}</p></div>
                           <button onClick={() => setConfirmModal({ isOpen: true, type: 'room', id: r.id, message: `Hapus ruangan ${r.name} dari sistem?` })} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={18}/></button>
                         </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* EDITOR MODAL (HISTORY EDIT) */}
      {editingId && editFormData && (
        <div className="fixed inset-0 z-[400] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[40px] shadow-2xl overflow-y-auto p-8 relative border">
            <div className="flex justify-between items-center mb-8 sticky top-0 bg-white py-2 z-10 border-b">
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2"><Edit3 size={24} className="text-indigo-500"/> Edit Laporan: {editFormData.date}</h3>
                <button onClick={() => setEditingId(null)} className="p-3 bg-slate-100 rounded-full hover:bg-slate-200"><X size={24}/></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div className="space-y-6">
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Unit Penunjang</h5>
                <div className="grid grid-cols-3 gap-2">
                  <NumberInput label="IGD PAGI" value={editFormData.igdPagi} onChange={v => setEditFormData({...editFormData, igdPagi: v})} bgClass="bg-slate-50 border" textColor="text-slate-800"/>
                  <NumberInput label="IGD SORE" value={editFormData.igdSore} onChange={v => setEditFormData({...editFormData, igdSore: v})} bgClass="bg-slate-50 border" textColor="text-slate-800"/>
                  <NumberInput label="IGD MLAM" value={editFormData.igdMalam} onChange={v => setEditFormData({...editFormData, igdMalam: v})} bgClass="bg-slate-50 border" textColor="text-slate-800"/>
                </div>
              </div>
              <div className="space-y-6">
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Kapasitas & Pasien Ruangan</h5>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {rooms.map(r => (
                    <div key={r.id} className="p-4 bg-slate-50 rounded-2xl border">
                      <label className="text-[10px] font-black uppercase mb-3 block text-indigo-600">{r.name}</label>
                      <div className="grid grid-cols-2 gap-2">
                        <NumberInput label="TOTAL TT" value={editFormData[r.ttKey] || r.defaultTT} onChange={v => setEditFormData({...editFormData, [r.ttKey]: v})} bgClass="bg-white border" textColor="text-slate-800"/>
                        <NumberInput label="PASIEN" value={editFormData[r.pasienKey] || 0} onChange={v => setEditFormData({...editFormData, [r.pasienKey]: v})} bgClass="bg-white border" textColor="text-slate-800"/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={() => handleSaveReport(editFormData)} className="full bg-emerald-500 text-white p-6 rounded-3xl font-black uppercase text-sm shadow-xl active:scale-95 transition-transform">Simpan Perubahan</button>
          </div>
        </div>
      )}

      {/* LOGIN MODAL ADMIN */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-[500] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl border">
            <div className="flex flex-col items-center mb-8"><div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-800 mb-4 shadow-lg"><ShieldCheck size={32}/></div><h3 className="text-xl font-black uppercase tracking-tighter text-slate-800">Area Super Admin</h3></div>
            <div className="space-y-3 mb-6">
              <input type="text" placeholder="Username" className="w-full bg-slate-100 rounded-2xl p-4 font-bold outline-none border text-slate-700" value={adminUserInput} onChange={e => setAdminUserInput(e.target.value)} />
              <input type="password" placeholder="Password" className="w-full bg-slate-100 rounded-2xl p-4 font-bold outline-none border text-slate-700" value={adminPassInput} onChange={e => setAdminPassInput(e.target.value)} />
            </div>
            <button onClick={() => {
              if (adminUserInput === authSettings.adminUsername && adminPassInput === authSettings.adminPassword) { setIsAdmin(true); setShowAdminLogin(false); }
              else showToast("Akses Ditolak!", "error");
              setAdminUserInput(''); setAdminPassInput('');
            }} className="w-full bg-slate-800 text-white p-4 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95">Verifikasi</button>
            <button onClick={() => setShowAdminLogin(false)} className="w-full mt-4 text-xs font-bold text-slate-400">Tutup</button>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default App;