import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trash2, Copy, Save, Users, Home, Heart, Settings,
  Activity, AlertCircle, CheckCircle, ChevronRight, Plus, X, Lock, LogOut,
  BarChart3, LayoutDashboard, ClipboardList, Edit3, Loader2, Baby, ShieldPlus,
  Stethoscope, Zap, Scissors, Droplets, KeyRound, AlertTriangle, ShieldCheck,
  Search, ShieldAlert, FileSpreadsheet, Download, Check, UserPlus, User, 
  CreditCard, Clock, MapPin, CalendarDays, Syringe, FileText, Siren, BedDouble
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, setDoc
} from "firebase/firestore";
import {
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken
} from "firebase/auth";

// ==========================================
// 1. CONFIGURATION & UTILITIES
// ==========================================

// --- FIREBASE CONFIG ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "sipas-rsud-lebong-e6a43.firebaseapp.com",
  projectId: "sipas-rsud-lebong-e6a43",
  storageBucket: "sipas-rsud-lebong-e6a43.firebasestorage.app",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'sipas-rsud-lebong-e6a43';

// --- SECURITY UTILITY (ENCRYPTION) ---
// Menggunakan XOR Cipher sederhana + Base64 encoding agar aman disimpan di DB
// Data akan diawali dengan 'ENC:' untuk menandai data terenkripsi

const toBase64 = (text) => {
  try {
    return btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
  } catch (e) { return text; }
};

const fromBase64 = (str) => {
  try {
    return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  } catch (e) { return str; }
};

const encrypt = (text, key) => {
  if (!text || !key) return text;
  // Jangan enkripsi jika bukan string atau key kosong
  try {
    const textStr = String(text);
    let result = '';
    for (let i = 0; i < textStr.length; i++) {
      result += String.fromCharCode(textStr.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return 'ENC:' + toBase64(result);
  } catch (e) {
    console.error("Encrypt failed", e);
    return text;
  }
};

const decrypt = (encoded, key) => {
  if (!encoded || !key) return encoded;
  try {
    const strEncoded = String(encoded);
    // Backward compatibility: Jika tidak ada prefix ENC:, berarti data lama (plain text)
    if (!strEncoded.startsWith('ENC:')) return strEncoded;

    const raw = fromBase64(strEncoded.substring(4));
    let result = '';
    for (let i = 0; i < raw.length; i++) {
      result += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch (e) {
    console.error("Decrypt failed", e);
    return encoded;
  }
};

// --- HELPER FUNCTIONS ---
const copyToClipboard = (text, callback) => {
  if (!text) return;
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999);
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful && callback) callback();
  } catch (err) {
    console.error('Fallback copy failed', err);
  }
};

const formatDateID = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const getReportingDate = () => {
  const now = new Date();
  if (now.getHours() < 7) now.setDate(now.getDate() - 1);
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const calculateAgeDetail = (birthDateStr) => {
  if (!birthDateStr) return { years: '', months: '', days: '' };
  const birth = new Date(birthDateStr);
  const now = new Date();
  if (isNaN(birth.getTime())) return { years: '', months: '', days: '' };

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();

  if (days < 0) {
    months--;
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += lastMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) return { years: 0, months: 0, days: 0 };
  return { years, months, days };
};

const formatReportText = (data, rooms) => {
  const dateStr = formatDateID(data.date);
  let text = `*LAPORAN PASIEN RSUD LEBONG*\nTgl: ${dateStr}\n\n`;

  // Transaksi Harian
  text += `*UNIT IGD (Kunjungan)*\nPagi : ${data.igdPagi || 0}\nSore : ${data.igdSore || 0}\nMalam : ${data.igdMalam || 0}\n`;
  text += `PONEK Pagi : ${data.igdPonekPagi || 0}\nPONEK Sore : ${data.igdPonekSore || 0}\nPONEK Malam : ${data.igdPonekMalam || 0}\n\n`;

  // Data Ruangan
  const totalRawat = rooms.reduce((acc, r) => acc + Number(data[r.pasienKey] || 0), 0);
  rooms.forEach(room => {
    text += `*${room.name}*\nTT : ${data[room.ttKey] || room.defaultTT}\nPasien : ${data[room.pasienKey] || 0}\nBPJS : ${data[room.bpjsKey] || 0}\nUmum : ${data[room.umumKey] || 0}\n\n`;
  });

  text += `*Total Pasien Terdata:* ${totalRawat}\n\n`;

  // Rincian Kegiatan OK & HD
  text += `*KEGIATAN OK (Rincian)*\n_Obgyn_\nElektif: ${data.okObgynElektif || 0}\nCito: ${data.okObgynCito || 0}\n`;
  text += `_Bedah_\nElektif: ${data.okBedahElektif || 0}\nCito: ${data.okBedahCito || 0}\n\n`;
  text += `*KEGIATAN HD (Rincian)*\nPagi: ${data.hdPagi || 0}\nSiang: ${data.hdSiang || 0}\nCito: ${data.hdCito || 0}`;

  return text;
};

// --- STYLES ---
const animationStyles = `
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  .glass-sidebar {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(20px);
    border-right: 1px solid rgba(255, 255, 255, 0.3);
  }
  .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
  input[type=number]::-webkit-inner-spin-button, 
  input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }
  .checkbox-wrapper input:checked + div { background-color: #10b981; border-color: #10b981; }
  .checkbox-wrapper input:checked + div svg { display: block; }
  @keyframes gradientBG { 
      0% { background-position: 0% 50%; } 
      50% { background-position: 100% 50%; } 
      100% { background-position: 0% 50%; } 
  }
  .simas-animated-bg {
      background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
      background-size: 400% 400%;
      animation: gradientBG 15s ease infinite;
  }
`;

// --- CONSTANTS ---
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
  'Users': Users, 'Baby': Baby, 'ShieldPlus': ShieldPlus, 'Stethoscope': Stethoscope,
  'ShieldCheck': ShieldCheck, 'ShieldAlert': ShieldAlert, 'Scissors': Scissors, 'Droplets': Droplets
};

const defaultRoomsList = [
  { id: 'IGD', name: 'IGD', defaultTT: 8, icon: 'ShieldAlert', ttKey: 'IGDTT', pasienKey: 'IGDPasien', bpjsKey: 'IGDBpjs', umumKey: 'IGDUmum', cardGradient: 'bg-gradient-to-br from-red-200 to-red-300', inputBg: 'bg-white/40' },
  { id: 'PONEK', name: 'IGD PONEK', defaultTT: 4, icon: 'Heart', ttKey: 'PONEKTT', pasienKey: 'PONEKPasien', bpjsKey: 'PONEKBpjs', umumKey: 'PONEKUmum', cardGradient: 'bg-gradient-to-br from-pink-200 to-pink-300', inputBg: 'bg-white/40' },
  { id: 'ICU', name: 'ICU', defaultTT: 6, icon: 'ShieldPlus', ttKey: 'ICUTT', pasienKey: 'ICUPasien', bpjsKey: 'ICUBpjs', umumKey: 'ICUUmum', cardGradient: 'bg-gradient-to-br from-indigo-200 to-indigo-300', inputBg: 'bg-white/40' },
  { id: 'NICU', name: 'NICU', defaultTT: 6, icon: 'Baby', ttKey: 'NICUTT', pasienKey: 'NICUPasien', bpjsKey: 'NICUBpjs', umumKey: 'NICUUmum', cardGradient: 'bg-gradient-to-br from-teal-200 to-teal-300', inputBg: 'bg-white/40' },
  { id: 'ASTER', name: 'ASTER (ANAK)', defaultTT: 23, icon: 'Baby', ttKey: 'ASTERTT', pasienKey: 'ASTERPasien', bpjsKey: 'ASTERBpjs', umumKey: 'ASTERUmum', cardGradient: 'bg-gradient-to-br from-amber-200 to-amber-300', inputBg: 'bg-white/40' },
  { id: 'ANGGREK', name: 'ANGGREK (BEDAH)', defaultTT: 23, icon: 'Activity', ttKey: 'ANGGREKTT', pasienKey: 'ANGGREKPasien', bpjsKey: 'ANGGREKBpjs', umumKey: 'ANGGREKUmum', cardGradient: 'bg-gradient-to-br from-cyan-200 to-cyan-300', inputBg: 'bg-white/40' },
  { id: 'AGLONEMA', name: 'AGLONEMA (INTERNA)', defaultTT: 24, icon: 'Stethoscope', ttKey: 'AGLONEMATT', pasienKey: 'AGLONEMAPasien', bpjsKey: 'AGLONEMABpjs', umumKey: 'AGLONEMAUmum', cardGradient: 'bg-gradient-to-br from-blue-200 to-blue-300', inputBg: 'bg-white/40' },
  { id: 'KOHORT', name: 'KOHORT', defaultTT: 10, icon: 'Users', ttKey: 'KOHORTTT', pasienKey: 'KOHORTPasien', bpjsKey: 'KOHORTBpjs', umumKey: 'KOHORTUmum', cardGradient: 'bg-gradient-to-br from-lime-200 to-lime-300', inputBg: 'bg-white/40' },
  { id: 'AZALEA', name: 'AZALEA (VIP)', defaultTT: 7, icon: 'Zap', ttKey: 'AZALEATT', pasienKey: 'AZALEAPasien', bpjsKey: 'AZALEABpjs', umumKey: 'AZALEAUmum', cardGradient: 'bg-gradient-to-br from-fuchsia-200 to-fuchsia-300', inputBg: 'bg-white/40' },
  { id: 'ALAMANDA', name: 'ALAMANDA (KEBIDANAN)', defaultTT: 16, icon: 'Heart', ttKey: 'ALAMANDATT', pasienKey: 'ALAMANDAPasien', bpjsKey: 'ALAMANDABpjs', umumKey: 'ALAMANDAUmum', cardGradient: 'bg-gradient-to-br from-rose-200 to-rose-300', inputBg: 'bg-white/40' },
  { id: 'PICU', name: 'PICU', defaultTT: 8, icon: 'ShieldPlus', ttKey: 'PICUTT', pasienKey: 'PICUPasien', bpjsKey: 'PICUBpjs', umumKey: 'PICUUmum', cardGradient: 'bg-gradient-to-br from-violet-200 to-violet-300', inputBg: 'bg-white/40' },
  { id: 'OK', name: 'OK (BEDAH SENTRAL)', defaultTT: 0, icon: 'Scissors', ttKey: 'OKTT', pasienKey: 'OKPasien', bpjsKey: 'OKBpjs', umumKey: 'OKUmum', cardGradient: 'bg-gradient-to-br from-emerald-200 to-emerald-300', inputBg: 'bg-white/40' },
  { id: 'HD', name: 'HEMODIALISA', defaultTT: 4, icon: 'Droplets', ttKey: 'HDTT', pasienKey: 'HDPasien', bpjsKey: 'HDBpjs', umumKey: 'HDUmum', cardGradient: 'bg-gradient-to-br from-orange-200 to-orange-300', inputBg: 'bg-white/40' },
];

// ==========================================
// 2. UI COMPONENTS
// ==========================================

const GlassContainer = ({ children, className = "" }) => (
  <div className={`bg-white/90 backdrop-blur-md border border-white/50 shadow-xl ${className}`}>
    {children}
  </div>
);

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[5000] animate-in slide-in-from-top-4 fade-in duration-300">
      <div className={`px-6 py-3 rounded-full shadow-lg flex items-center space-x-3 backdrop-blur-2xl border border-white/20 ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
        {type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
        <span className="text-xs font-bold uppercase tracking-wide">{message}</span>
      </div>
    </div>
  );
};

const NumberInput = ({ label, value, onChange, onBlur, bgClass = "bg-white/40", textColor = "text-slate-800", disabled = false }) => {
  const [internalVal, setInternalVal] = useState(value);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) setInternalVal(value);
  }, [value, isFocused]);

  const handleFocus = (e) => {
    if (!disabled) {
      setIsFocused(true);
      e.target.select();
    }
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  const handleChange = (e) => {
    if (disabled) return;
    const val = e.target.value;
    setInternalVal(val);
    if (val === '') {
      onChange(0);
    } else {
      const parsed = parseInt(val);
      if (!isNaN(parsed)) onChange(parsed);
    }
  };

  return (
    <div className="flex flex-col">
      <label className={`text-[9px] font-black ${textColor} opacity-70 uppercase mb-1.5 truncate tracking-wider`}>{label}</label>
      <input
        type="number" min="0"
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        className={`w-full ${bgClass} border-0 rounded-xl py-2.5 px-2 text-center font-black ${textColor} outline-none ${disabled ? 'opacity-80 cursor-not-allowed' : 'focus:ring-2 focus:ring-white/50 shadow-inner'} text-sm transition-all backdrop-blur-sm appearance-none placeholder-slate-400`}
        value={isFocused ? internalVal : (value || 0)}
        onChange={handleChange}
      />
    </div>
  );
};

const RoomCard = React.memo(({ room, report, onChange, onSave, isAdmin, onDeleteRoom, onUpdateName }) => {
  const Icon = iconMap[room.icon] || Home;
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(room.name);

  useEffect(() => { setTempName(room.name); }, [room.name]);

  const handleSaveName = () => {
    if (tempName && tempName !== room.name) {
      onUpdateName(room.id, tempName);
    }
    setIsEditingName(false);
  };

  return (
    <div className={`${room.cardGradient} rounded-[2.5rem] p-6 shadow-xl relative overflow-hidden transition-all hover:shadow-2xl hover:-translate-y-1 h-full flex flex-col justify-between border border-white/20 group`}>
      <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      {/* Header */}
      <div className="flex justify-between items-center mb-6 relative z-10 text-slate-800">
        <div className="flex items-center space-x-4 w-full">
          <div className="p-3 bg-white/40 rounded-2xl backdrop-blur-md shadow-inner shrink-0"><Icon size={22} className="text-slate-800" /></div>
          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  className="text-sm font-black uppercase bg-transparent border-b border-slate-500 text-slate-800 outline-none w-full"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                />
                <button onMouseDown={(e) => e.preventDefault()} onClick={handleSaveName} className="p-1 bg-white/40 rounded-full hover:bg-white/60 text-slate-800 shadow-md transition-all shrink-0">
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <h3 className="text-sm font-black uppercase truncate tracking-tight flex items-center gap-2 group/title text-slate-800">
                {room.name}
                {isAdmin && (
                  <button onClick={(e) => { e.stopPropagation(); setIsEditingName(true); }} className="p-1.5 bg-white/30 hover:bg-white/50 rounded-lg text-slate-700 transition-colors opacity-0 group-hover/title:opacity-100" title="Ubah Nama Ruangan">
                    <Edit3 size={12} />
                  </button>
                )}
              </h3>
            )}
            <p className="text-[10px] font-bold opacity-60 tracking-widest text-slate-700">KAPASITAS: {report[room.ttKey] || room.defaultTT}</p>
          </div>
        </div>
        {isAdmin && <button onClick={() => onDeleteRoom(room.id)} className="p-2.5 bg-white/30 text-slate-700 rounded-xl hover:bg-rose-500/80 hover:text-white transition-colors backdrop-blur-sm shrink-0 ml-2"><Trash2 size={16} /></button>}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-4 gap-2 bg-white/30 p-3 rounded-[2rem] backdrop-blur-sm relative z-10 border border-white/20">
        <NumberInput label="TT" value={report[room.ttKey] || room.defaultTT} onChange={(val) => onChange(room.ttKey, val)} onBlur={onSave} bgClass="bg-white/50" textColor="text-slate-800" />
        <NumberInput label="PASIEN" value={report[room.pasienKey]} onChange={(val) => onChange(room.pasienKey, val)} bgClass="bg-white/60" disabled={true} textColor="text-slate-800" />
        <NumberInput label="BPJS" value={report[room.bpjsKey]} onChange={(val) => onChange(room.bpjsKey, val)} bgClass="bg-white/60" disabled={true} textColor="text-slate-800" />
        <NumberInput label="UMUM" value={report[room.umumKey]} onChange={(val) => onChange(room.umumKey, val)} bgClass="bg-white/60" disabled={true} textColor="text-slate-800" />
      </div>
    </div>
  );
});

// ==========================================
// 3. MAIN APPLICATION COMPONENT
// ==========================================

const App = () => {
  // --- STATE: APP & DATA ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [report, setReport] = useState(initialReportData);
  const [rooms, setRooms] = useState(defaultRoomsList);
  const [savedReports, setSavedReports] = useState([]);
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(null);
  const [dbStatus, setDbStatus] = useState('connecting');

  // --- STATE: AUTH & ACCESS ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaffLoggedIn, setIsStaffLoggedIn] = useState(false);
  const [isInfoLoggedIn, setIsInfoLoggedIn] = useState(false);
  const [loggedInRoomId, setLoggedInRoomId] = useState(null);
  const [adminSelectedRoomId, setAdminSelectedRoomId] = useState('');

  // LOGIN FORM STATE
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const loginPassRef = useRef(null);

  // --- STATE: SETTINGS & EDITS ---
  const [isSaving, setIsSaving] = useState(false);
  const [downloadRoomFilter, setDownloadRoomFilter] = useState('');
  const [roomNameEdits, setRoomNameEdits] = useState({});
  const [newRoomData, setNewRoomData] = useState({ name: '', id: '', hasUmum: true });
  const [authSettings, setAuthSettings] = useState({
    staffPassword: '123', adminUsername: 'admin', adminPassword: '123',
    infoPassword: '123', publicAccessCode: '123', roomAccess: {}
  });

  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: '', id: '', message: '', title: '' });

  // --- STATE: PATIENTS & ENCRYPTION ---
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [isLocalSearchVisible, setIsLocalSearchVisible] = useState(false);
  const [searchRoomFilter, setSearchRoomFilter] = useState('');
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockKeyInput, setUnlockKeyInput] = useState('');
  const [editingPatient, setEditingPatient] = useState(null);
  const [patientMasterKey, setPatientMasterKey] = useState(sessionStorage.getItem('rs_session_key') || '');
  const [isPatientLocked, setIsPatientLocked] = useState(!sessionStorage.getItem('rs_session_key'));
  
  // PATIENT FORM DATA STATE
  const [patientFormData, setPatientFormData] = useState({
    name: '', age: '', room: '', address: '', gender: 'Laki-Laki',
    paymentStatus: 'BPJS', admissionDate: new Date().toISOString().split('T')[0],
    status: 'Dirawat /Inap', outcomeDate: '', jenisOperasi: '',
    // IGD Fields
    mrn: '', nik: '', birthDate: '', ageMonth: '', ageDay: '',
    doctorIGD: '', doctorIntern: '', doctorDPJP: '',
    diagnosisPrimary: '', diagnosisSecondary: '',
    entryStatus: 'Non Rujukan', serviceType: '',
    followUp: 'Dirawat', exitNote: '',
    isDeadInIGD: false, isDOA: false, isInjury: false, isFalseEmergency: false,
    // Inpatient Fields
    classRoom: 'III', jknType: 'PBI (APBD)', doctorKonsul: '',
    tariff: '', icd10Code: '', action: '', hp: '', notes: ''
  });

  const showToast = (msg, type = 'success') => setToast({ message: msg, type });

  // ==========================================
  // 4. EFFECTS & SUBSCRIPTIONS
  // ==========================================

  // 1. INIT & AUTHENTICATION
  useEffect(() => {
    const initAuth = async () => {
      setDbStatus('connecting');
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        setDbStatus('offline');
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => {
      if (u) { setUser(u); setDbStatus('online'); }
      else setDbStatus('offline');
    });
  }, []);

  // 2. AUTO-LOCK TIMER (5 Menit)
  useEffect(() => {
    let timer;
    if (!isPatientLocked) {
      // Jika enkripsi terbuka, mulai timer 5 menit
      timer = setTimeout(() => {
        setIsPatientLocked(true);
        setPatientMasterKey('');
        sessionStorage.removeItem('rs_session_key');
        showToast("Sesi akses nama habis (Otomatis Terkunci)", "error");
      }, 5 * 60 * 1000); // 5 Menit dalam milidetik
    }
    return () => clearTimeout(timer); // Bersihkan timer jika komponen unmount atau status berubah
  }, [isPatientLocked]);

  // 3. DATA SUBSCRIPTIONS (Firestore Listeners)
  useEffect(() => {
    if (!user) return;

    // -- SETTINGS SUBSCRIPTION --
    const unsubAuth = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'auth'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAuthSettings({
          ...data,
          roomAccess: data.roomAccess || {},
          infoPassword: data.infoPassword || '123',
          publicAccessCode: data.publicAccessCode || '123'
        });
      } else {
        setDoc(snap.ref, {
          staffPassword: '123', adminUsername: 'admin', adminPassword: '123',
          infoPassword: '123', publicAccessCode: '123', roomAccess: {}
        });
      }
    });

    // -- ROOMS SUBSCRIPTION --
    const unsubRooms = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'rooms'), (snap) => {
      const dbRoomsMap = new Map();
      snap.docs.forEach(d => dbRoomsMap.set(d.id, { id: d.id, ...d.data() }));

      const mergedRooms = defaultRoomsList.map(defaultRoom => {
        const dbRoom = dbRoomsMap.get(defaultRoom.id);
        return dbRoom ? { ...defaultRoom, ...dbRoom } : defaultRoom;
      });

      snap.docs.forEach(d => {
        if (!defaultRoomsList.find(r => r.id === d.id)) {
          mergedRooms.push({ id: d.id, ...d.data() });
        }
      });

      setRooms(mergedRooms);
      const initialEdits = {};
      mergedRooms.forEach(r => initialEdits[r.id] = r.name);
      setRoomNameEdits(initialEdits);
    });

    // -- REPORTS SUBSCRIPTION --
    const unsubReports = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'reports'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sorted = data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setSavedReports(sorted);

      const currentReportingDate = getReportingDate();
      const currentData = sorted.find(r => r.date === currentReportingDate);
      if (currentData) setReport(prev => ({ ...prev, ...currentData }));
      else setReport({ ...initialReportData, date: currentReportingDate });
    });

    // -- PATIENTS SUBSCRIPTION (WITH DECRYPTION) --
    const unsubPatients = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'patients'), (snapshot) => {
      const decryptedData = snapshot.docs.map(doc => {
        const data = doc.data();
        
        // Decrypt sensitive fields
        const realName = decrypt(data.name, patientMasterKey);
        const realAddress = decrypt(data.address, patientMasterKey);
        const realAge = decrypt(data.age, patientMasterKey);

        const realRoom = data.room;
        const realPayment = data.paymentStatus;
        const realJenisOperasi = data.jenisOperasi || ''; 

        if (isPatientLocked) {
          // Jika terkunci, tampilkan mask (••••) tapi pertahankan statistik room/payment
          return {
            id: doc.id, ...data,
            name: '••••', age: '••', room: realRoom, address: '••••',
            paymentStatus: realPayment, admissionDate: '•••',
            statsRoom: realRoom, statsPayment: realPayment,
            jenisOperasi: realJenisOperasi
          };
        }

        // Jika terbuka, gunakan hasil dekripsi
        return {
          id: doc.id, ...data,
          name: realName, age: realAge, room: realRoom, address: realAddress,
          paymentStatus: realPayment,
          admissionDate: data.admissionDate || new Date().toISOString().split('T')[0],
          statsRoom: realRoom, statsPayment: realPayment,
          jenisOperasi: realJenisOperasi
        };
      });
      setPatients(decryptedData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });

    return () => { unsubAuth(); unsubRooms(); unsubReports(); unsubPatients(); };
  }, [user, patientMasterKey, isPatientLocked]);

  // 3. AUTO-CALCULATE REPORT STATS
  const calculatedStats = useMemo(() => {
    const stats = {};
    rooms.forEach(r => {
      const activePts = patients.filter(p => (p.statsRoom || p.room) === r.name && p.status === 'Dirawat /Inap');
      stats[r.pasienKey] = activePts.length;
      stats[r.bpjsKey] = activePts.filter(p => (p.statsPayment || p.paymentStatus) === 'BPJS').length;
      stats[r.umumKey] = activePts.filter(p => (p.statsPayment || p.paymentStatus) === 'Umum').length;
    });

    const okPatients = patients.filter(p => p.room && (p.room.includes('OK') || p.room.includes('BEDAH SENTRAL')));
    if (okPatients.length > 0) {
        stats.okObgynElektif = okPatients.filter(p => p.jenisOperasi === 'Obgyn Elektif').length;
        stats.okObgynCito = okPatients.filter(p => p.jenisOperasi === 'Obgyn Cito').length;
        stats.okBedahElektif = okPatients.filter(p => p.jenisOperasi === 'Bedah Umum').length;
    }

    return stats;
  }, [patients, rooms]);

  const finalReport = useMemo(() => ({
    ...report, ...calculatedStats
  }), [report, calculatedStats]);

  // ==========================================
  // 5. MEMOIZED DATA (FILTERS)
  // ==========================================
  const visibleRooms = useMemo(() => {
    if (isStaffLoggedIn && loggedInRoomId) return rooms.filter(r => r.id === loggedInRoomId);
    if (isAdmin && adminSelectedRoomId) return rooms.filter(r => r.id === adminSelectedRoomId);
    return rooms;
  }, [rooms, isStaffLoggedIn, loggedInRoomId, isAdmin, adminSelectedRoomId]);

  const missingRooms = useMemo(() => rooms.filter(r => Number(report[r.pasienKey] || 0) === 0), [rooms, report]);

  const roomPatients = useMemo(() => {
    const targetRoomId = isStaffLoggedIn ? loggedInRoomId : (isAdmin ? adminSelectedRoomId : null);
    if (!targetRoomId) return [];
    const roomName = rooms.find(r => r.id === targetRoomId)?.name;
    if (!roomName) return [];
    let filtered = patients.filter(p => p.room === roomName);
    if (localSearchTerm) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(localSearchTerm.toLowerCase()));
    }
    return filtered;
  }, [patients, loggedInRoomId, rooms, localSearchTerm, isAdmin, adminSelectedRoomId, isStaffLoggedIn]);

  const searchResults = useMemo(() => {
    let results = patients;
    if (isStaffLoggedIn && loggedInRoomId) {
      const myRoom = rooms.find(r => r.id === loggedInRoomId);
      if (myRoom) results = results.filter(p => p.room === myRoom.name);
    } else if (searchRoomFilter) {
      const roomName = rooms.find(r => r.id === searchRoomFilter)?.name;
      if (roomName) results = results.filter(p => p.room === roomName);
    }
    if (searchTerm) {
      results = results.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return results;
  }, [patients, searchTerm, searchRoomFilter, rooms, isStaffLoggedIn, loggedInRoomId]);

  const patientsToDownload = useMemo(() => {
    let data = patients;
    if (isStaffLoggedIn && loggedInRoomId) {
      const myRoom = rooms.find(r => r.id === loggedInRoomId);
      if (myRoom) data = data.filter(p => p.room === myRoom.name);
    } else if (isAdmin && downloadRoomFilter) {
      const selectedRoom = rooms.find(r => r.id === downloadRoomFilter);
      if (selectedRoom) data = data.filter(p => p.room === selectedRoom.name);
    }
    return data;
  }, [patients, isStaffLoggedIn, loggedInRoomId, isAdmin, downloadRoomFilter, rooms]);

  // ==========================================
  // 6. EVENT HANDLERS
  // ==========================================

  const handleOpenAddModal = () => {
    setEditingPatient(null);
    const targetRoomId = isStaffLoggedIn ? loggedInRoomId : (isAdmin ? adminSelectedRoomId : null);
    const currentRoom = rooms.find(r => r.id === targetRoomId);
    const roomName = currentRoom ? currentRoom.name : '';

    setPatientFormData({
      name: '', age: '', room: roomName, address: '', gender: 'Laki-Laki',
      paymentStatus: 'BPJS', admissionDate: new Date().toISOString().split('T')[0],
      status: 'Dirawat /Inap', outcomeDate: '', jenisOperasi: '',
      mrn: '', nik: '', birthDate: '', ageMonth: '', ageDay: '',
      doctorIGD: '', doctorIntern: '', doctorDPJP: '',
      diagnosisPrimary: '', diagnosisSecondary: '',
      entryStatus: 'Non Rujukan', serviceType: 'Non Bedah Lainnya',
      followUp: 'Dirawat', exitNote: '',
      isDeadInIGD: false, isDOA: false, isInjury: false, isFalseEmergency: false,
      classRoom: 'III', jknType: 'PBI (APBD)', doctorKonsul: '',
      tariff: '', icd10Code: '', action: '', hp: '', notes: ''
    });
    setIsPatientModalOpen(true);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const accessKey = authSettings.publicAccessCode || '123';

    if (loginUsername === authSettings.adminUsername && loginPassword === authSettings.adminPassword) {
      setIsAdmin(true); setIsPatientLocked(false); setPatientMasterKey(accessKey);
      setShowLoginModal(false); setActiveTab('dashboard'); showToast("Login Berhasil: Super Admin");
      return;
    }

    if (loginUsername.toLowerCase() === 'informasi' && loginPassword === (authSettings.infoPassword || '123')) {
      setIsInfoLoggedIn(true); setIsPatientLocked(false); setPatientMasterKey(accessKey);
      setShowLoginModal(false); setActiveTab('search'); showToast("Login Berhasil: Petugas Informasi");
      return;
    }

    const matchedRoomId = Object.keys(authSettings.roomAccess).find(roomId => {
      const creds = authSettings.roomAccess[roomId];
      return creds && creds.username === loginUsername && creds.password === loginPassword;
    });

    let finalRoomId = matchedRoomId;
    if (!finalRoomId) {
      const roomById = rooms.find(r => r.id.toLowerCase() === loginUsername.toLowerCase() || r.name.toLowerCase() === loginUsername.toLowerCase());
      if (roomById) {
        if (!authSettings.roomAccess[roomById.id] && loginPassword === authSettings.staffPassword) {
          finalRoomId = roomById.id;
        }
      }
    }

    if (finalRoomId) {
      setIsStaffLoggedIn(true); setLoggedInRoomId(finalRoomId);
      setIsPatientLocked(false); setPatientMasterKey(accessKey);
      setShowLoginModal(false); setActiveTab('input');
      showToast(`Login Berhasil: ${rooms.find(r => r.id === finalRoomId)?.name}`);
    } else {
      showToast("Username atau Password Salah!", "error");
    }
  };

  const handleLogout = () => {
    setIsAdmin(false); setIsStaffLoggedIn(false); setLoggedInRoomId(null);
    setIsInfoLoggedIn(false); setIsPatientLocked(true); setPatientMasterKey('');
    sessionStorage.removeItem('rs_session_key');
    setActiveTab('dashboard'); setLoginUsername(''); setLoginPassword('');
    showToast("Logout Berhasil");
  };

  const handleUpdateRoomName = async (roomId, newName) => {
    if (!user || !newName.trim()) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId), { name: newName }, { merge: true });
      showToast("Nama Ruangan Diperbarui");
    } catch (e) {
      showToast("Gagal update nama", "error");
    }
  };

  const updateCredentials = async (data) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'auth'), data);
    showToast("Password diperbarui");
  };

  const saveRoomConfiguration = async (roomId, newName, username, password) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId), { name: newName }, { merge: true });
    } catch (e) { console.error("Error updating room name", e); }

    const updatedAccess = { ...authSettings.roomAccess, [roomId]: { username, password } };
    const newSettings = { ...authSettings, roomAccess: updatedAccess };
    setAuthSettings(newSettings);

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'auth'), newSettings, { merge: true });
      showToast(`Konfigurasi ${newName} tersimpan`);
    } catch (e) { showToast("Gagal menyimpan konfigurasi", "error"); }
  }

  const handleAddRoom = async () => {
    if (!newRoomData.name || !newRoomData.id) return;
    const cid = newRoomData.id.toUpperCase().replace(/\s/g, '');
    const room = {
      id: cid, name: newRoomData.name, icon: 'Home', defaultTT: 20,
      ttKey: `${cid}TT`, pasienKey: `${cid}Pasien`, bpjsKey: `${cid}Bpjs`,
      umumKey: newRoomData.hasUmum ? `${cid}Umum` : null,
      cardGradient: 'bg-slate-200', inputBg: 'bg-white/40'
    };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', cid), room);
    saveRoomConfiguration(cid, newRoomData.name, cid.toLowerCase(), '123');
    setNewRoomData({ name: '', id: '', hasUmum: true });
    showToast("Ruangan ditambahkan");
  };

  const handleSaveReport = async () => {
    if (!user) return showToast("Tidak ada koneksi", "error");
    const dataToSave = finalReport;
    const existing = savedReports.find(r => r.date === dataToSave.date);
    try {
      if (existing) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reports', existing.id), { ...dataToSave, updatedAt: Date.now(), updatedBy: user.uid });
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'reports'), { ...dataToSave, createdAt: Date.now(), updatedBy: user.uid });
      }
      if (!isSaving) showToast("Perubahan Disimpan");
      setEditingId(null);
    } catch (e) {
      if (e.code === 'permission-denied') showToast("Akses Ditolak: Cek Rules Firebase Anda", "error");
      else showToast("Gagal simpan: " + e.message, "error");
    }
  };

  const handleConfirmAction = async () => {
    if (!user || isSaving) return;

    if (confirmModal.type === 'save_patient') {
      setIsSaving(true);
      
      // ENCRYPTION APPLIED HERE
      const payload = {
        name: encrypt(patientFormData.name, patientMasterKey),
        age: encrypt(patientFormData.age, patientMasterKey),
        address: encrypt(patientFormData.address, patientMasterKey),
        
        room: patientFormData.room,
        paymentStatus: patientFormData.paymentStatus,
        gender: patientFormData.gender,
        admissionDate: patientFormData.admissionDate,
        status: patientFormData.status,
        outcomeDate: patientFormData.outcomeDate || '',
        jenisOperasi: patientFormData.jenisOperasi || '', 
        
        // Extended Fields
        mrn: patientFormData.mrn || '',
        nik: patientFormData.nik || '',
        birthDate: patientFormData.birthDate || '',
        ageMonth: patientFormData.ageMonth || '',
        ageDay: patientFormData.ageDay || '',
        doctorIGD: patientFormData.doctorIGD || '',
        doctorIntern: patientFormData.doctorIntern || '',
        doctorDPJP: patientFormData.doctorDPJP || '',
        diagnosisPrimary: patientFormData.diagnosisPrimary || '',
        diagnosisSecondary: patientFormData.diagnosisSecondary || '',
        entryStatus: patientFormData.entryStatus || '',
        serviceType: patientFormData.serviceType || '',
        followUp: patientFormData.followUp || '',
        exitNote: patientFormData.exitNote || '',
        isDeadInIGD: patientFormData.isDeadInIGD || false,
        isDOA: patientFormData.isDOA || false,
        isInjury: patientFormData.isInjury || false,
        isFalseEmergency: patientFormData.isFalseEmergency || false,
        
        classRoom: patientFormData.classRoom || '',
        jknType: patientFormData.jknType || '',
        doctorKonsul: patientFormData.doctorKonsul || '',
        icd10Code: patientFormData.icd10Code || '',
        tariff: patientFormData.tariff || '',
        action: patientFormData.action || '',
        hp: patientFormData.hp || '',
        notes: patientFormData.notes || '',

        updatedAt: new Date().toISOString(),
        updatedBy: user.uid
      };

      try {
        if (editingPatient) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'patients', editingPatient.id), payload);
        } else {
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'patients'), { ...payload, createdAt: new Date().toISOString() });
        }
        setIsPatientModalOpen(false);
        showToast("Data Berhasil Disimpan!");
        setEditingPatient(null);
        const defaultRoomName = loggedInRoomId ? rooms.find(r => r.id === loggedInRoomId)?.name || '' : '';
        setPatientFormData({ name: '', age: '', room: defaultRoomName, address: '', gender: 'Laki-Laki', paymentStatus: 'BPJS', admissionDate: new Date().toISOString().split('T')[0], status: 'Dirawat /Inap', outcomeDate: '', jenisOperasi: '' });
      } catch (e) {
        if (e.code === 'permission-denied') showToast("Akses Ditolak: Cek Rules Firebase Anda", "error");
        else showToast("Gagal simpan: Error jaringan", "error");
      } finally {
        setIsSaving(false);
        setConfirmModal({ isOpen: false });
      }
    }
    else if (confirmModal.id) {
      setIsSaving(true);
      try {
        const coll = confirmModal.type === 'report' ? 'reports' : (confirmModal.type === 'patient' ? 'patients' : 'rooms');
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', coll, confirmModal.id));
        showToast("Data Berhasil Dihapus");
        setConfirmModal({ isOpen: false });
      } catch (e) {
        if (e.code === 'permission-denied') showToast("Akses Hapus Ditolak", "error");
        else showToast("Gagal menghapus", "error");
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handlePatientSubmit = async (e) => {
    e.preventDefault();
    if (!user || isPatientLocked) return;

    if (!patientFormData.name || !patientFormData.age || !patientFormData.address || !patientFormData.admissionDate || !patientFormData.room) {
      showToast("Gagal simpan: Semua data wajib diisi!", "error");
      return;
    }

    if (patientFormData.room !== 'IGD' && patientFormData.room !== 'IGD PONEK' && patientFormData.status !== 'Dirawat /Inap' && !patientFormData.outcomeDate) {
      showToast("Gagal simpan: Tanggal keluar wajib diisi!", "error");
      return;
    }

    setConfirmModal({
      isOpen: true, type: 'save_patient', title: 'Konfirmasi Simpan',
      message: 'Apakah data yang Anda masukkan sudah benar? Lanjutkan penyimpanan?'
    });
  };

  const handleUnlockAkses = () => {
    const validCode = authSettings.publicAccessCode || '123';
    if (unlockKeyInput.trim() === validCode) {
      setPatientMasterKey(unlockKeyInput);
      sessionStorage.setItem('rs_session_key', unlockKeyInput);
      setIsPatientLocked(false);
      setIsUnlockModalOpen(false);
      setUnlockKeyInput('');
      showToast("Enkripsi Terbuka");
    } else {
      showToast("Kode Akses Salah!", "error");
    }
  };

  // --- EXCEL EXPORT ---
  const handleDownloadExcel = () => {
    const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
    const now = new Date();
    const currentMonth = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();

    let roomNameDisplay = "ALL";
    if (isStaffLoggedIn && loggedInRoomId) {
      roomNameDisplay = rooms.find(r => r.id === loggedInRoomId)?.name.toUpperCase() || "RUANGAN";
    } else if (isAdmin && downloadRoomFilter) {
      roomNameDisplay = rooms.find(r => r.id === downloadRoomFilter)?.name.toUpperCase() || "RUANGAN";
    }

    let tableRows = "";
    let tableHeader = "";
    
    // Style Definisi untuk Excel
    const commonStyle = 'font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #000000; vertical-align: middle; border: .5pt solid #000000;';
    const borderStyle = `${commonStyle} padding: 4px; text-align: left;`;
    const centerStyle = `${commonStyle} padding: 4px; text-align: center;`;
    const textStyle = `mso-number-format:"\\@"; ${borderStyle}`; // Force Text format
    const thStyle = 'border: .5pt solid #000000; background-color: #e0e0e0; font-weight: bold; text-align: center; padding: 10px; font-size: 12pt; font-family: Calibri, Arial, sans-serif; color: #000000; vertical-align: middle;';
    const metaLabelStyle = 'padding: 4px; font-family: Calibri, Arial, sans-serif; font-size: 12pt; font-weight: bold; color: #000000; border: none; text-align: left;';
    const metaValueStyle = 'padding: 4px; font-family: Calibri, Arial, sans-serif; font-size: 12pt; font-weight: bold; color: #000000; border: none; text-align: left;';

    const isIGD = roomNameDisplay.includes('IGD');
    const isOK = roomNameDisplay.includes('OK') || roomNameDisplay.includes('BEDAH SENTRAL');
    const isHD = roomNameDisplay.includes('HEMODIALISA');
    const isInpatient = !isIGD && !isOK && !isHD; 

    if (isIGD) {
        tableHeader = `
          <tr>
            <th style="${thStyle}">No</th><th style="${thStyle}">Tanggal Masuk UGD</th><th style="${thStyle}">Nomor RM</th><th style="${thStyle}">Nama Pasien</th><th style="${thStyle}">Jenis Kelamin</th>
            <th style="${thStyle}">NIK / No BPJS</th><th style="${thStyle}">Tanggal Lahir</th><th style="${thStyle}">Umur (Tahun)</th><th style="${thStyle}">Umur (Bulan)</th><th style="${thStyle}">Umur (Hari)</th>
            <th style="${thStyle}">Alamat</th><th style="${thStyle}">Dokter UGD</th><th style="${thStyle}">Dokter Internsip</th><th style="${thStyle}">Dokter DPJP</th>
            <th style="${thStyle}">Diagnosa Utama</th><th style="${thStyle}">Diagnosa Sekunder</th><th style="${thStyle}">JKN / BPJS</th><th style="${thStyle}">UMUM</th><th style="${thStyle}">GR</th>
            <th style="${thStyle}">Keterangan Masuk</th><th style="${thStyle}">Jenis Pelayanan</th><th style="${thStyle}">Tindak Lanjut Pelayanan</th><th style="${thStyle}">Catatan Keterangan Keluar</th>
            <th style="${thStyle}">Mati di IGD</th><th style="${thStyle}">DOA (Death On Arrive)</th><th style="${thStyle}">Luka-Luka</th><th style="${thStyle}">False Emergency</th>
          </tr>`;

        patientsToDownload.forEach((p, index) => {
            const admissionDate = p.admissionDate ? formatDateID(p.admissionDate) : '';
            const birthDate = p.birthDate ? formatDateID(p.birthDate) : '';
            tableRows += `
              <tr>
                <td style="${centerStyle}">${index + 1}</td><td style="${centerStyle}">${admissionDate}</td><td style="${textStyle}">${p.mrn || ''}</td>
                <td style="${borderStyle}">${p.name || ''}</td><td style="${borderStyle}">${p.gender || ''}</td><td style="${textStyle}">${p.nik || ''}</td>
                <td style="${centerStyle}">${birthDate}</td><td style="${centerStyle}">${p.age ? p.age + ' th' : ''}</td><td style="${centerStyle}">${p.ageMonth ? p.ageMonth + ' bln' : ''}</td>
                <td style="${centerStyle}">${p.ageDay ? p.ageDay + ' hr' : ''}</td><td style="${borderStyle}">${p.address || ''}</td>
                <td style="${borderStyle}">${p.doctorIGD || ''}</td><td style="${borderStyle}">${p.doctorIntern || ''}</td><td style="${borderStyle}">${p.doctorDPJP || ''}</td>
                <td style="${borderStyle}">${p.diagnosisPrimary || ''}</td><td style="${borderStyle}">${p.diagnosisSecondary || ''}</td>
                <td style="${centerStyle}">${p.paymentStatus === 'BPJS' ? 'V' : ''}</td><td style="${centerStyle}">${p.paymentStatus === 'Umum' ? 'V' : ''}</td><td style="${centerStyle}">${p.paymentStatus === 'GR' ? 'V' : ''}</td>
                <td style="${borderStyle}">${p.entryStatus || ''}</td><td style="${borderStyle}">${p.serviceType || ''}</td><td style="${borderStyle}">${p.followUp || ''}</td>
                <td style="${borderStyle}">${p.exitNote || ''}</td><td style="${centerStyle}">${p.isDeadInIGD ? 'V' : ''}</td><td style="${centerStyle}">${p.isDOA ? 'V' : ''}</td>
                <td style="${centerStyle}">${p.isInjury ? 'V' : ''}</td><td style="${centerStyle}">${p.isFalseEmergency ? 'V' : ''}</td>
              </tr>`;
        });
    } else if (isInpatient) {
        tableHeader = `
          <tr>
            <th style="${thStyle}">No</th><th style="${thStyle}">Nama Ruangan</th><th style="${thStyle}">Nomor RM</th><th style="${thStyle}">Nama Pasien</th><th style="${thStyle}">Nomor NIK / BPJS</th>
            <th style="${thStyle}">Jenis Kepesertaan JKN</th><th style="${thStyle}">Jenis Kelamin</th><th style="${thStyle}">Tanggal Lahir</th>
            <th style="${thStyle}">Umur (Tahun)</th><th style="${thStyle}">Umur (Bulan)</th><th style="${thStyle}">Umur (Hari)</th>
            <th style="${thStyle}">Alamat</th><th style="${thStyle}">Tanggal Masuk</th><th style="${thStyle}">Tanggal Keluar</th><th style="${thStyle}">Lama Di Rawat (Hari)</th>
            <th style="${thStyle}">Dokter DPJP</th><th style="${thStyle}">Tarif</th><th style="${thStyle}">Dokter Konsul</th>
            <th style="${thStyle}">Diagnosa Utama</th><th style="${thStyle}">Kode ICD 10</th><th style="${thStyle}">Diagnosa Sekunder</th><th style="${thStyle}">Tindakan</th>
            <th style="${thStyle}">JKN / BPJS</th><th style="${thStyle}">UMUM</th><th style="${thStyle}">GR</th>
            <th style="${thStyle}">Kelas</th><th style="${thStyle}">HP (Hari Perawatan)</th><th style="${thStyle}">Keterangan Keluar</th><th style="${thStyle}">Keterangan</th>
          </tr>`;
        
        patientsToDownload.forEach((p, index) => {
            const admissionDate = p.admissionDate ? formatDateID(p.admissionDate) : '';
            const outcomeDate = p.outcomeDate ? formatDateID(p.outcomeDate) : '';
            const birthDate = p.birthDate ? formatDateID(p.birthDate) : '';
            let los = '';
            if (p.admissionDate && p.outcomeDate) {
               const diff = Math.abs(new Date(p.outcomeDate) - new Date(p.admissionDate));
               los = Math.ceil(diff / (1000 * 60 * 60 * 24)) || 1;
            }

            tableRows += `
              <tr>
                <td style="${centerStyle}">${index + 1}</td><td style="${borderStyle}">${p.room}</td><td style="${textStyle}">${p.mrn || ''}</td>
                <td style="${borderStyle}">${p.name}</td><td style="${textStyle}">${p.nik || ''}</td><td style="${borderStyle}">${p.jknType || ''}</td>
                <td style="${borderStyle}">${p.gender}</td><td style="${centerStyle}">${birthDate}</td>
                <td style="${centerStyle}">${p.age}</td><td style="${centerStyle}">${p.ageMonth || ''}</td><td style="${centerStyle}">${p.ageDay || ''}</td>
                <td style="${borderStyle}">${p.address}</td><td style="${centerStyle}">${admissionDate}</td><td style="${centerStyle}">${outcomeDate}</td>
                <td style="${centerStyle}">${los}</td><td style="${borderStyle}">${p.doctorDPJP || ''}</td><td style="${borderStyle}">${p.tariff || ''}</td>
                <td style="${borderStyle}">${p.doctorKonsul || ''}</td><td style="${borderStyle}">${p.diagnosisPrimary || ''}</td><td style="${centerStyle}">${p.icd10Code || ''}</td>
                <td style="${borderStyle}">${p.diagnosisSecondary || ''}</td><td style="${borderStyle}">${p.action || ''}</td>
                <td style="${centerStyle}">${p.paymentStatus === 'BPJS' ? 'V' : ''}</td><td style="${centerStyle}">${p.paymentStatus === 'Umum' ? 'V' : ''}</td><td style="${centerStyle}">${p.paymentStatus === 'GR' ? 'V' : ''}</td>
                <td style="${centerStyle}">${p.classRoom || ''}</td><td style="${centerStyle}">${p.hp || ''}</td>
                <td style="${borderStyle}">${p.status}</td><td style="${borderStyle}">${p.notes || ''}</td>
              </tr>`;
        });

    } else {
        tableHeader = `
          <tr>
            <th style="${thStyle}">No</th><th style="${thStyle}">Nomor RM</th><th style="${thStyle}">Nama Pasien</th><th style="${thStyle}">Jenis Kelamin</th>
            <th style="${thStyle}">Umur</th><th style="${thStyle}">Alamat</th><th style="${thStyle}">Tanggal Masuk</th><th style="${thStyle}">Status</th>
            <th style="${thStyle}">Jenis Operasi</th>
          </tr>`;
        patientsToDownload.forEach((p, index) => {
             tableRows += `<tr><td style="${centerStyle}">${index + 1}</td><td style="${textStyle}"> </td><td style="${borderStyle}">${p.name}</td><td style="${borderStyle}">${p.gender}</td><td style="${centerStyle}">${p.age}</td><td style="${borderStyle}">${p.address}</td><td style="${centerStyle}">${p.admissionDate}</td><td style="${borderStyle}">${p.status}</td><td style="${borderStyle}">${p.jenisOperasi || '-'}</td></tr>`;
        });
    }

    const htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Laporan ${currentMonth}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <style>body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #000000; } table { border-collapse: collapse; width: 100%; mso-displayed-decimal-separator:"\,"; mso-displayed-thousand-separator:"\."; } td, th { border: .5pt solid #000000; } br { mso-data-placement:same-cell; }</style></head>
      <body>
        <table>
            <tr><td colspan="2" style="${metaLabelStyle}">Ruangan :</td><td colspan="5" style="${metaValueStyle}">${roomNameDisplay}</td></tr>
            <tr><td colspan="2" style="${metaLabelStyle}">Bulan :</td><td colspan="5" style="${metaValueStyle}">${currentMonth}</td></tr>
            <tr><td colspan="2" style="${metaLabelStyle}">Tahun :</td><td colspan="5" style="${metaValueStyle}">${currentYear}</td></tr>
            <tr></tr>
            <tr><td colspan="20" style="${metaLabelStyle} font-size: 14pt; text-decoration: underline;">LAPORAN ${roomNameDisplay} BULAN ${currentMonth} TAHUN ${currentYear}</td></tr>
            <tr></tr>
        </table>
        <table><thead>${tableHeader}</thead><tbody>${tableRows}</tbody></table>
      </body></html>`;

    const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_${roomNameDisplay}_${currentMonth}_${currentYear}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- RENDER SECTIONS ---
  const renderSearch = () => (
    <div className="space-y-8 animate-in fade-in duration-500">
      <GlassContainer className="rounded-[2.5rem] p-8 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Search size={16} /> Pencarian Pasien</h2>
          {isPatientLocked ? (
            <button onClick={() => setIsUnlockModalOpen(true)} className="text-[10px] bg-rose-50 text-rose-600 px-4 py-1.5 rounded-full font-bold shadow-sm hover:bg-rose-100 transition-colors">Buka Nama</button>
          ) : (
            <span className="text-[10px] bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full font-bold shadow-sm">Terbuka</span>
          )}
        </div>
        <div className="flex flex-col md:flex-row gap-4">
          {!isStaffLoggedIn && (
            <div className="relative md:w-1/3">
              <select
                className="w-full bg-white/50 p-4 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100/50 transition-all appearance-none cursor-pointer text-xs uppercase border border-slate-100"
                value={searchRoomFilter}
                onChange={(e) => setSearchRoomFilter(e.target.value)}
              >
                <option value="">-- SEMUA RUANGAN --</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" size={16} />
            </div>
          )}
          <div className={`relative ${!isStaffLoggedIn ? 'md:w-2/3' : 'w-full'}`}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder={isStaffLoggedIn ? "Cari pasien di ruangan ini..." : "Ketik Nama Pasien..."}
              className="w-full bg-white/50 p-4 pl-12 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100/50 transition-all text-sm border border-slate-100"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          {searchResults.length > 0 ? (
            <div className="overflow-hidden border border-slate-200 rounded-2xl relative bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-indigo-600 text-white font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-4 border-b border-indigo-700 whitespace-nowrap">No</th>
                      <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Ruangan</th>
                      <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Nama</th>
                      <th className="p-4 border-b border-indigo-700 whitespace-nowrap">JK</th>
                      <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Usia</th>
                      <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Alamat</th>
                      <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Tgl Masuk</th>
                      <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Tgl Keluar</th>
                      <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Status</th>
                      <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchResults.map((p, i) => (
                      <tr key={p.id} className="hover:bg-indigo-50/50 transition-colors group">
                        <td className="p-4 font-bold text-slate-500 text-center border-r border-slate-100">{i + 1}</td>
                        <td className="p-4 border-r border-slate-100 whitespace-nowrap">{p.room}</td>
                        <td className="p-4 font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">
                            {p.name}
                            {p.jenisOperasi && <span className="block text-[9px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded w-fit mt-1">{p.jenisOperasi}</span>}
                            {['IGD', 'IGD PONEK'].includes(p.room) && p.diagnosisPrimary && <span className="block text-[9px] text-slate-500 font-normal mt-1 max-w-[150px] truncate">{p.diagnosisPrimary}</span>}
                        </td>
                        <td className="p-4 border-r border-slate-100 text-center">{p.gender === 'Laki-Laki' ? 'L' : 'P'}</td>
                        <td className="p-4 text-center border-r border-slate-100">{p.age} Th</td>
                        <td className="p-4 border-r border-slate-100 max-w-[150px] truncate" title={p.address}>{p.address || '-'}</td>
                        <td className="p-4 border-r border-slate-100 whitespace-nowrap">{formatDateID(p.admissionDate)}</td>
                        <td className="p-4 border-r border-slate-100 whitespace-nowrap">{p.outcomeDate ? formatDateID(p.outcomeDate) : '-'}</td>
                        <td className="p-4 border-r border-slate-100 text-center">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${p.paymentStatus === 'BPJS' ? 'bg-sky-100 text-sky-700' : p.paymentStatus === 'GR' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                            {p.paymentStatus}
                          </span>
                        </td>
                        <td className="p-4 border-r border-slate-100">
                          {['IGD', 'IGD PONEK'].includes(p.room) ? (
                             <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${p.followUp === 'Dirawat' ? 'bg-emerald-100 text-emerald-700' : p.followUp === 'Meninggal di IGD' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                             {p.followUp}
                           </span>
                          ) : (
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${p.status === 'Dirawat /Inap' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                              {p.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50 p-3 border-t border-slate-200 text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total: {searchResults.length} Pasien Ditemukan</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-white/30 rounded-[2rem] border border-dashed border-slate-300/50">
              <Users size={32} className="mx-auto text-slate-400/50 mb-3" />
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">
                {searchTerm ? `Tidak ada pasien dengan nama "${searchTerm}"` : "Belum ada data pasien"}
              </p>
            </div>
          )}
        </div>
      </GlassContainer>
    </div>
  );

  const renderDashboard = () => {
    // USE FINAL REPORT FOR DASHBOARD
    const totalPatients = rooms.reduce((acc, r) => acc + Number(finalReport[r.pasienKey] || 0), 0);
    const totalTT = rooms.reduce((acc, r) => acc + Number(finalReport[r.ttKey] || r.defaultTT || 0), 0);
    const totalBor = totalTT > 0 ? (totalPatients / totalTT) * 100 : 0;

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        {missingRooms.length > 0 && (
          <GlassContainer className="!bg-rose-50/60 !border-rose-100 rounded-[2rem] p-6 pulse-red">
            <div className="flex items-center gap-3 mb-4 text-rose-600"><AlertTriangle size={24} /><h3 className="text-xs font-black uppercase tracking-widest">Peringatan: Belum Lapor</h3></div>
            <div className="flex flex-wrap gap-2">
              {missingRooms.map(r => (
                <span key={r.id} className="bg-white text-rose-600 border border-rose-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></div>
                  {r.name}
                </span>
              ))}
            </div>
          </GlassContainer>
        )}
        <div className="w-full mb-8">
          <div className="bg-gradient-to-br from-blue-600 to-cyan-500 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-500/20 relative overflow-hidden border border-white/10 group w-full">
            <div className="absolute -right-12 -bottom-12 p-4 opacity-10 group-hover:scale-110 transition-transform duration-700"><Activity size={180} /></div>
            <h2 className="text-xs font-black text-white/60 uppercase mb-4 tracking-widest flex justify-between items-center">
              <span>Total Pasien Rawat Inap</span>
              <span className="text-white/80 bg-white/20 px-3 py-1 rounded-full">{formatDateID(report.date)}</span>
            </h2>
            <div className="flex items-end space-x-3"><span className="text-7xl font-black tracking-tighter">{totalPatients}</span><span className="text-xl font-bold opacity-70 mb-3">Pasien</span></div>
            <div className="mt-8 bg-black/20 rounded-full h-3 w-full overflow-hidden backdrop-blur-sm"><div className="bg-white h-full rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(255,255,255,0.5)]" style={{ width: `${Math.min(totalBor, 100)}%` }}></div></div>
            <div className="flex justify-between mt-3 text-[10px] font-bold text-white/70 uppercase tracking-widest"><span>BOR RSUD LEBONG</span><span>{totalBor.toFixed(1)}%</span></div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-24">
          {rooms.map(r => {
            const filled = Number(finalReport[r.pasienKey] || 0) > 0;
            const pct = Number(finalReport[r.pasienKey] || 0) / Number(finalReport[r.ttKey] || r.defaultTT || 1) * 100;
            const bpjsCount = Number(finalReport[r.bpjsKey] || 0);
            const umumCount = Number(finalReport[r.umumKey] || 0);
            return (
              <GlassContainer key={r.id} className="rounded-[2rem] p-5 flex flex-col justify-between hover:bg-white/80 transition-all cursor-default min-h-[140px]">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs text-white shadow-lg ${filled ? (r.cardGradient || 'bg-blue-500') : 'bg-slate-200'}`}>{filled ? `${pct.toFixed(0)}%` : '0%'}</div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-700 tracking-wide block">{r.name}</span>
                      <span className={`text-[9px] font-black ${filled ? 'text-emerald-600' : 'text-slate-400'}`}>{filled ? 'TERISI' : 'KOSONG'}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 bg-slate-50 p-2 rounded-xl">
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] uppercase tracking-wider opacity-70">Total</span>
                      <span className="text-slate-800 text-sm font-black">{Number(finalReport[r.pasienKey] || 0)}</span>
                    </div>
                    <div className="w-px h-6 bg-slate-200"></div>
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] uppercase tracking-wider opacity-70">BPJS</span>
                      <span className="text-emerald-600 text-sm font-black">{bpjsCount}</span>
                    </div>
                    <div className="w-px h-6 bg-slate-200"></div>
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] uppercase tracking-wider opacity-70">UMUM</span>
                      <span className="text-amber-600 text-sm font-black">{umumCount}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full"><div className={`${filled ? 'bg-indigo-500' : 'bg-slate-300'} h-full transition-all duration-1000`} style={{ width: `${Math.min(pct, 100)}%` }}></div></div>
                </div>
              </GlassContainer>
            );
          })}
        </div>
      </div>
    );
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, activeIconBg: 'bg-indigo-500' },
  ];

  if (isStaffLoggedIn || isAdmin) {
    navItems.push({ id: 'input', label: 'Input Data', icon: LayoutDashboard, activeIconBg: 'bg-blue-500' });
  }

  if ((!isStaffLoggedIn && !isAdmin)) {
    navItems.push({ id: 'search', label: 'Cari Pasien', icon: Search, activeIconBg: 'bg-pink-500' });
  }

  if (isStaffLoggedIn || isAdmin) {
    navItems.push({ id: 'preview', label: 'Salin Teks', icon: Copy, activeIconBg: 'bg-teal-500' });
    navItems.push({ id: 'download', label: 'Laporan', icon: FileSpreadsheet, activeIconBg: 'bg-emerald-600' });
  }

  if (isAdmin) {
    navItems.push({ id: 'history', label: 'Arsip Data', icon: ClipboardList, activeIconBg: 'bg-emerald-500' });
    navItems.push({ id: 'settings', label: 'Setting', icon: Settings, activeIconBg: 'bg-sky-500' });
  }

  // --- RENDER ---
  return (
    <>
      <style>{animationStyles}</style>
      <div className="flex h-screen w-full simas-animated-bg font-sans flex-col md:flex-row overflow-hidden text-slate-800 selection:bg-indigo-500 selection:text-white">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        
        {/* MODALS */}
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[5000] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6">
            <GlassContainer className="w-full max-w-sm rounded-[2.5rem] p-10 text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ${confirmModal.type === 'save_patient' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
                {confirmModal.type === 'save_patient' ? <CheckCircle size={40} /> : <AlertTriangle size={40} />}
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter mb-2">{confirmModal.title || 'Konfirmasi'}</h3>
              <p className="text-sm text-slate-700 font-extrabold mb-8 leading-relaxed px-4">{confirmModal.message}</p>
              <div className="flex gap-4">
                <button onClick={() => !isSaving && setConfirmModal({ isOpen: false })} disabled={isSaving} className={`flex-1 p-4 bg-slate-50 rounded-2xl font-black uppercase text-[10px] text-slate-500 transition-colors ${isSaving ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-100'}`}>Batal</button>
                <button
                  onClick={handleConfirmAction}
                  disabled={isSaving}
                  className={`flex-1 p-4 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg transition-all ${isSaving ? 'opacity-70 cursor-not-allowed scale-100' : 'hover:scale-105'} ${confirmModal.type === 'save_patient' ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-rose-500 shadow-rose-500/30'}`}
                >
                  {isSaving ? 'Memproses...' : (confirmModal.type === 'save_patient' ? 'Ya, Simpan' : 'Ya, Hapus')}
                </button>
              </div>
            </GlassContainer>
          </div>
        )}

        {isUnlockModalOpen && (
          <div className="fixed inset-0 z-[400] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
            <GlassContainer className="w-full max-w-sm rounded-[2.5rem] p-10 text-center !bg-white">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mx-auto mb-6 shadow-inner"><KeyRound size={40} /></div>
              <h3 className="text-xl font-black uppercase tracking-tighter mb-2">Akses Data Pasien</h3>
              <p className="text-xs text-slate-400 font-bold mb-6 leading-relaxed px-4">Masukkan kunci akses untuk membuka sensor nama.</p>
              <input
                type="password"
                placeholder="Kunci Akses"
                className="w-full bg-slate-50 rounded-2xl py-3 px-4 font-bold text-center text-slate-700 outline-none border border-transparent focus:border-indigo-500 focus:bg-white transition-all mb-4"
                value={unlockKeyInput}
                onChange={e => setUnlockKeyInput(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUnlockAkses();
                }}
              />
              <div className="flex gap-4">
                <button onClick={() => setIsUnlockModalOpen(false)} className="flex-1 p-4 bg-slate-50 rounded-2xl font-black uppercase text-[10px] text-slate-500 hover:bg-slate-100 transition-colors">Batal</button>
                <button onClick={handleUnlockAkses} className="flex-1 p-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all hover:scale-105">Buka</button>
              </div>
            </GlassContainer>
          </div>
        )}

        {/* --- SIDEBAR --- */}
        <aside className="hidden md:flex w-72 flex-col m-0 h-screen bg-white/20 backdrop-blur-xl border-r border-white/30 shadow-2xl z-50 fixed left-0 top-0 bottom-0">
          <div className="p-8 pb-6 shrink-0">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20"><Activity size={28} /></div>
              <div>
                <h1 className="text-2xl font-black tracking-tighter uppercase leading-none">SIPAS</h1>
                <span className="text-xs font-bold text-indigo-600 tracking-widest">RSUD LEBONG</span>
              </div>
            </div>

            {/* STATUS LOGIN DISPLAY */}
            {isStaffLoggedIn && loggedInRoomId && (
              <div className="mt-6 p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 flex flex-col gap-2 animate-in fade-in">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Login Sebagai</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-black text-indigo-700">{rooms.find(r => r.id === loggedInRoomId)?.name}</span>
                  <button onClick={handleLogout} className="p-1.5 bg-white text-rose-500 rounded-lg shadow-sm hover:bg-rose-50 transition-colors"><LogOut size={14} /></button>
                </div>
              </div>
            )}
            {isAdmin && (
              <div className="mt-6 p-4 bg-indigo-700 rounded-2xl border border-indigo-600 flex flex-col gap-2 animate-in fade-in shadow-lg">
                <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest">Login Sebagai</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-black text-white">SUPER ADMIN</span>
                  <button onClick={handleLogout} className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-500 transition-colors"><LogOut size={14} /></button>
                </div>
              </div>
            )}
            {isInfoLoggedIn && (
              <div className="mt-6 p-4 bg-sky-50/60 rounded-2xl border border-sky-100 flex flex-col gap-2 animate-in fade-in">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Login Sebagai</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-black text-sky-700">INFORMASI</span>
                  <button onClick={handleLogout} className="p-1.5 bg-white text-rose-500 rounded-lg shadow-sm hover:bg-rose-50 transition-colors"><LogOut size={14} /></button>
                </div>
              </div>
            )}

            {!isStaffLoggedIn && !isAdmin && !isInfoLoggedIn && (
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest mt-4 pl-1">Dashboard Monitoring</p>
            )}
          </div>

          <nav className="flex-1 px-6 py-4 space-y-4 overflow-y-auto scrollbar-hide">
            {navItems.map((item) => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center p-4 rounded-[1.5rem] transition-all duration-300 group ${activeTab === item.id ? 'bg-white shadow-xl shadow-indigo-100 text-indigo-600' : 'text-slate-700 hover:bg-white/50 hover:text-slate-900'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-4 transition-all ${activeTab === item.id ? `${item.activeIconBg} text-white shadow-lg` : 'bg-slate-100 text-slate-500 group-hover:bg-white'}`}><item.icon size={20} /></div>
                <span className={`text-xs font-bold uppercase tracking-wide`}>{item.label}</span>
              </button>
            ))}

            {!isStaffLoggedIn && !isAdmin && !isInfoLoggedIn && (
              <button onClick={() => setShowLoginModal(true)} className="w-full flex items-center p-4 rounded-[1.5rem] transition-all text-slate-700 hover:bg-white/80 hover:text-indigo-600 hover:shadow-lg">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mr-4 bg-slate-100 text-slate-500"><Lock size={20} /></div>
                <span className="text-xs font-black uppercase tracking-widest">Login Petugas</span>
              </button>
            )}
          </nav>
        </aside>

        {/* --- MOBILE NAVIGATION --- */}
        <nav className="fixed bottom-6 left-6 right-6 h-20 bg-white/80 backdrop-blur-2xl rounded-full shadow-2xl flex justify-around items-center border border-white/50 z-50 md:hidden px-2">
          {navItems.map((item) => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex flex-col items-center p-2 rounded-2xl transition-all duration-300 ${activeTab === item.id ? '-translate-y-6' : 'opacity-60'}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-1 transition-all shadow-lg ${activeTab === item.id ? `${item.activeIconBg} text-white ring-4 ring-white` : 'bg-transparent text-slate-500 shadow-none'}`}><item.icon size={22} /></div>
              {activeTab === item.id && <span className="text-[9px] font-black uppercase tracking-tight text-slate-800 absolute -bottom-4 bg-white/80 backdrop-blur px-2 py-0.5 rounded-full shadow-sm">{item.label.split(' ')[0]}</span>}
            </button>
          ))}
          {!isStaffLoggedIn && !isAdmin && !isInfoLoggedIn && (
            <button onClick={() => setShowLoginModal(true)} className={`flex flex-col items-center p-2 rounded-2xl transition-all duration-300 opacity-60 hover:opacity-100`}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1 transition-all shadow-none bg-transparent text-slate-500"><Lock size={22} /></div>
            </button>
          )}
        </nav>

        {/* --- MAIN CONTENT AREA --- */}
        <main className="flex-1 h-full overflow-hidden relative md:ml-72 flex flex-col">
          <header className="px-6 py-6 flex flex-col gap-4 bg-transparent shrink-0 z-40 md:hidden">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3 text-indigo-700 font-black tracking-tighter uppercase text-xl">
                <div className="w-10 h-10 bg-white/50 backdrop-blur rounded-xl flex items-center justify-center shadow-lg"><Activity size={24} /></div>
                <span>SIPAS</span>
              </div>
              <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wide flex items-center gap-2 backdrop-blur-md border border-white/30 shadow-lg ${dbStatus === 'online' ? 'bg-emerald-100/80 text-emerald-700' : 'bg-red-100/80 text-red-700'}`}>
                <div className={`w-2 h-2 rounded-full ${dbStatus === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                {dbStatus}
              </div>
            </div>
            {(isStaffLoggedIn || isAdmin || isInfoLoggedIn) && (
              <div className="flex justify-between items-center bg-white/40 backdrop-blur-md p-3 rounded-2xl border border-white/40 shadow-sm animate-in slide-in-from-top-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600"><User size={16} /></div>
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Login</p>
                    <h2 className="text-xs font-black text-indigo-700 uppercase">
                      {isAdmin ? 'SUPER ADMIN' : isInfoLoggedIn ? 'INFORMASI' : rooms.find(r => r.id === loggedInRoomId)?.name}
                    </h2>
                  </div>
                </div>
                <button onClick={handleLogout} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm"><LogOut size={16} /></button>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 md:pb-10 scrollbar-hide">
            <div className="max-w-7xl mx-auto w-full space-y-6">

              {activeTab === 'dashboard' && renderDashboard()}
              {activeTab === 'search' && renderSearch()}

              {activeTab === 'input' && (
                <div className="space-y-6 animate-in slide-in-from-right duration-500">
                  {(isStaffLoggedIn && loggedInRoomId) || isAdmin ? (
                    <>
                      <GlassContainer className="rounded-[2.5rem] p-6 relative">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest pl-2">Tanggal Laporan</h2>
                          <div className="flex items-center gap-4 w-full md:w-auto">
                            {isAdmin && (
                              <div className="relative w-full md:w-48">
                                <select
                                  className="w-full bg-slate-50 pl-4 pr-10 py-3 rounded-2xl text-xs font-black border-2 border-transparent focus:border-indigo-100 outline-none text-slate-700 shadow-inner appearance-none uppercase"
                                  value={adminSelectedRoomId}
                                  onChange={(e) => setAdminSelectedRoomId(e.target.value)}
                                >
                                  <option value="">-- PILIH RUANGAN --</option>
                                  {rooms.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" size={16} />
                              </div>
                            )}

                            <div className="relative w-full md:w-auto flex-1">
                              <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500" size={18} />
                              <input type="date" value={report.date} onChange={e => setReport({ ...report, date: e.target.value })} className="w-full bg-slate-50 pl-12 pr-6 py-3 rounded-2xl text-base font-black border-2 border-transparent focus:border-indigo-100 outline-none text-slate-700 shadow-inner" />
                            </div>
                          </div>
                        </div>
                      </GlassContainer>

                      <div className={`grid grid-cols-1 ${isAdmin && !adminSelectedRoomId ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-6`}>
                        {visibleRooms.map(room => (
                          <RoomCard key={room.id} room={room} report={finalReport} onChange={(k, v) => setReport(p => ({ ...p, [k]: v }))} onSave={() => handleSaveReport()} isAdmin={isAdmin} onDeleteRoom={(id) => setConfirmModal({ isOpen: true, type: 'room', id, message: 'Hapus ruangan ini?' })} onUpdateName={handleUpdateRoomName} />
                        ))}
                      </div>
                      <div className="mt-12 border-t border-white/30 pt-8">
                        <div className="flex flex-col gap-4 mb-8">
                          <div className="flex justify-between items-center">
                            <h3 className="text-xl font-black text-slate-700 uppercase tracking-tighter flex items-center gap-3">
                              <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600"><Users size={24} /></div>
                              Daftar Pasien
                            </h3>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setIsLocalSearchVisible(!isLocalSearchVisible)}
                                className={`p-3 rounded-full transition-all ${isLocalSearchVisible ? 'bg-indigo-100 text-indigo-600' : 'bg-white text-slate-400 hover:text-indigo-500 shadow-sm'}`}
                              >
                                <Search size={20} />
                              </button>
                              <button
                                type="button"
                                onClick={handleOpenAddModal}
                                className="bg-blue-600 text-white px-6 py-3 rounded-full font-bold text-xs uppercase tracking-wide shadow-xl hover:scale-105 transition-transform flex items-center gap-3"
                              >
                                <UserPlus size={18} /> Tambah
                              </button>
                            </div>
                          </div>
                          {isLocalSearchVisible && (
                            <div className="animate-in slide-in-from-top-2 fade-in">
                              <input
                                type="text"
                                placeholder="Cari nama pasien..."
                                className="w-full p-4 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-bold text-slate-700"
                                value={localSearchTerm}
                                onChange={(e) => setLocalSearchTerm(e.target.value)}
                                autoFocus
                              />
                            </div>
                          )}
                        </div>

                        <div className="grid gap-4">
                          {roomPatients.length === 0 ? (
                            <div className="text-center py-16 bg-white/40 rounded-[2.5rem] border-2 border-dashed border-slate-200/60">
                              <Users size={48} className="mx-auto text-slate-300 mb-4" />
                              <p className="text-slate-400 font-bold text-sm uppercase tracking-wide">
                                {localSearchTerm ? `Tidak ada pasien dengan nama "${localSearchTerm}"` : (isAdmin && !adminSelectedRoomId ? "Pilih ruangan untuk melihat/input pasien" : "Belum ada data pasien di ruangan ini")}
                              </p>
                            </div>
                          ) : (
                            roomPatients.map(p => (
                              <GlassContainer key={p.id} className="rounded-3xl p-5 flex justify-between items-center group hover:border-indigo-200 transition-colors">
                                <div className="flex items-center gap-5">
                                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg ${p.gender === 'Laki-Laki' ? 'bg-blue-500 text-white' : 'bg-rose-500 text-white'}`}>
                                    {p.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="font-black text-slate-800 text-lg">{p.name}</p>
                                    <p className="text-xs text-slate-500 mt-1">{p.address || 'Alamat tidak diisi'}</p>
                                    <div className="flex gap-2 mt-2 items-center flex-wrap">
                                      <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-lg font-bold text-slate-500 uppercase">{p.gender}</span>
                                      <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-lg font-bold text-slate-500 uppercase">{p.age} Thn</span>
                                      <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold uppercase ${p.status === 'Dirawat /Inap' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>{p.status}</span>
                                      <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold uppercase ${p.paymentStatus === 'BPJS' ? 'bg-sky-100 text-sky-600' : p.paymentStatus === 'GR' ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>{p.paymentStatus}</span>
                                      {p.jenisOperasi && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold uppercase bg-pink-100 text-pink-600 border border-pink-200">
                                            {p.jenisOperasi}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <div className="flex gap-2">
                                    <button onClick={() => { setEditingPatient(p); setPatientFormData(p); setIsPatientModalOpen(true); }} className="p-3 bg-indigo-50 rounded-xl text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors shadow-sm"><Edit3 size={18} /></button>
                                    <button onClick={() => setConfirmModal({ isOpen: true, type: 'patient', id: p.id, message: `Hapus pasien ${p.name}?` })} className="p-3 bg-rose-50 rounded-xl text-rose-600 hover:bg-rose-600 hover:text-white transition-colors shadow-sm"><Trash2 size={18} /></button>
                                  </div>
                                  <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full">Masuk: {formatDateID(p.admissionDate)}</span>
                                </div>
                              </GlassContainer>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <GlassContainer className="rounded-[2.5rem] p-8 text-center mb-8 border-dashed border-2 border-indigo-200 bg-indigo-50/30">
                      <h2 className="text-2xl font-black text-slate-400 uppercase tracking-widest mb-2">Area Terbatas</h2>
                      <p className="text-slate-400 font-bold mb-6 text-sm">Silakan login untuk mengakses input data ruangan</p>
                    </GlassContainer>
                  )}
                </div>
              )}

              {activeTab === 'preview' && (
                <div className="h-full flex flex-col gap-6 animate-in slide-in-from-right duration-500 pb-32 md:pb-6">
                  <GlassContainer className="flex-1 rounded-[2.5rem] p-10 text-slate-700 font-mono text-sm overflow-y-auto shadow-2xl border-white/60 leading-relaxed whitespace-pre-wrap">
                    {formatReportText(finalReport, rooms)}
                  </GlassContainer>
                  <div className="flex justify-center shrink-0">
                    <button onClick={() => { copyToClipboard(formatReportText(finalReport, rooms), () => showToast("Teks Berhasil Disalin!")); }} className="bg-indigo-600 text-white px-10 py-4 rounded-full font-black uppercase tracking-widest text-xs shadow-2xl shadow-indigo-600/40 active:scale-95 transition-all flex items-center gap-3 hover:bg-indigo-700 border-4 border-white/20 backdrop-blur-md">
                      <Copy size={20} /> Salin Teks
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'download' && (
                <div className="h-full flex flex-col gap-6 pb-20">
                  <GlassContainer className="p-8 rounded-[2.5rem] flex flex-col gap-6 h-full overflow-hidden">
                    <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-200 pb-6">
                      <div>
                        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                          <FileSpreadsheet className="text-blue-600" />
                          Export Data
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">Pratinjau dan unduh data laporan pasien.</p>
                      </div>

                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => { copyToClipboard(formatReportText(finalReport, rooms), () => showToast("Teks Berhasil Disalin!")); }}
                          className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 px-4 py-3 rounded-xl font-bold text-xs transition-all flex items-center gap-2"
                        >
                          <Copy size={16} /> Salin Teks
                        </button>

                        {isAdmin && (
                          <div className="relative">
                            <select
                              className="appearance-none bg-slate-100 border border-slate-200 text-slate-700 py-3 pl-4 pr-10 rounded-xl font-bold text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                              value={downloadRoomFilter}
                              onChange={(e) => setDownloadRoomFilter(e.target.value)}
                            >
                              <option value="">-- SEMUA RUANGAN --</option>
                              {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={14} />
                          </div>
                        )}

                        <button
                          onClick={handleDownloadExcel}
                          className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold text-xs shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-all flex items-center gap-2"
                        >
                          <Download size={16} /> DOWNLOAD EXCEL
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl relative bg-white shadow-sm">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-indigo-600 text-white font-bold uppercase tracking-wider">
                          <tr>
                            <th className="p-4 border-b border-indigo-700 whitespace-nowrap">No</th>
                            <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Ruangan</th>
                            <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Nama</th>
                            <th className="p-4 border-b border-indigo-700 whitespace-nowrap">JK</th>
                            <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Usia</th>
                            <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Alamat</th>
                            <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Tgl Masuk</th>
                            <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Tgl Keluar</th>
                            <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Status</th>
                            <th className="p-4 border-b border-indigo-700 whitespace-nowrap">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {patientsToDownload.length > 0 ? (
                            patientsToDownload.map((p, i) => (
                              <tr key={p.id} className="hover:bg-indigo-50/50 transition-colors group">
                                <td className="p-4 font-bold text-slate-500 text-center border-r border-slate-100">{i + 1}</td>
                                <td className="p-4 border-r border-slate-100 whitespace-nowrap">{p.room}</td>
                                <td className="p-4 font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">
                                    {p.name}
                                    {p.jenisOperasi && <span className="block text-[9px] text-blue-600 mt-1">({p.jenisOperasi})</span>}
                                    {['IGD', 'IGD PONEK'].includes(p.room) && p.diagnosisPrimary && <span className="block text-[9px] text-slate-500 font-normal mt-1 max-w-[150px] truncate">{p.diagnosisPrimary}</span>}
                                </td>
                                <td className="p-4 border-r border-slate-100 text-center">{p.gender === 'Laki-Laki' ? 'L' : 'P'}</td>
                                <td className="p-4 text-center border-r border-slate-100">{p.age} Th</td>
                                <td className="p-4 border-r border-slate-100 max-w-[150px] truncate" title={p.address}>{p.address || '-'}</td>
                                <td className="p-4 border-r border-slate-100 whitespace-nowrap">{formatDateID(p.admissionDate)}</td>
                                <td className="p-4 border-r border-slate-100 whitespace-nowrap">{p.outcomeDate ? formatDateID(p.outcomeDate) : '-'}</td>
                                <td className="p-4 border-r border-slate-100 text-center">
                                  <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${p.paymentStatus === 'BPJS' ? 'bg-sky-100 text-sky-700' : p.paymentStatus === 'GR' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {p.paymentStatus}
                                  </span>
                                </td>
                                <td className="p-4 border-r border-slate-100">
                                  {['IGD', 'IGD PONEK'].includes(p.room) ? (
                                     <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${p.followUp === 'Dirawat' ? 'bg-emerald-100 text-emerald-700' : p.followUp === 'Meninggal di IGD' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                     {p.followUp}
                                   </span>
                                  ) : (
                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${p.status === 'Dirawat /Inap' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                      {p.status}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="10" className="p-10 text-center text-slate-400 font-bold">Tidak ada data untuk filter ini.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Total Data: {patientsToDownload.length} Pasien
                    </div>
                  </GlassContainer>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-6 animate-in slide-in-from-right duration-500 pb-32">
                  <GlassContainer className="p-8 rounded-[2.5rem] flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Arsip Laporan</h2>
                    <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500"><ClipboardList size={28} /></div>
                  </GlassContainer>
                  <div className="grid gap-4">
                    {savedReports.map(item => (
                      <GlassContainer key={item.id} className="p-6 rounded-[2rem] flex flex-col md:flex-row justify-between items-center gap-6 hover:border-indigo-300 transition-colors group">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-500/30">{new Date(item.date).getDate()}</div>
                          <div>
                            <h4 className="font-black text-slate-800 uppercase text-lg tracking-tight">{formatDateID(item.date)}</h4>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest opacity-80 mt-1">Diinput: {new Date(item.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button onClick={() => { setEditFormData(item); setEditingId(item.id); }} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"><Edit3 size={20} /></button>
                          <button onClick={() => setConfirmModal({ isOpen: true, type: 'report', id: item.id, message: 'Hapus data laporan ini secara permanen?' })} className="p-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"><Trash2 size={20} /></button>
                          <button onClick={() => { copyToClipboard(formatReportText(item, rooms), () => showToast("Disalin!")); }} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all shadow-lg hover:bg-black">Salin</button>
                        </div>
                      </GlassContainer>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="space-y-8 animate-in slide-in-from-right duration-500 pb-32">
                  <GlassContainer className="p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-8 flex items-center gap-4 relative z-10"><div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><ShieldCheck size={28} /></div> Keamanan Admin</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                      <div className="space-y-4">
                        <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Identitas Admin</h5>
                        <div className="grid grid-cols-2 gap-4">
                          <input type="text" className="w-full bg-white/50 rounded-2xl p-5 font-bold text-sm outline-none border border-slate-200 focus:border-indigo-500 text-slate-700 transition-colors" value={authSettings.adminUsername} onChange={e => setAuthSettings({ ...authSettings, adminUsername: e.target.value })} />
                          <input type="password" className="w-full bg-white/50 rounded-2xl p-5 font-bold outline-none border border-slate-200 focus:border-indigo-500 text-slate-700 transition-colors" value={authSettings.adminPassword} onChange={e => setAuthSettings({ ...authSettings, adminPassword: e.target.value })} />
                        </div>
                        <button onClick={() => updateCredentials(authSettings)} className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 hover:bg-black transition-all">Update Admin</button>
                      </div>
                    </div>

                    {/* ADD NEW ROOM SECTION */}
                    <div className="mt-12 pt-10 border-t border-slate-200 relative z-10">
                      <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 ml-1">Tambah Ruangan Baru</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div className="space-y-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase ml-1">ID Ruangan (Tanpa Spasi)</span>
                          <input
                            type="text"
                            className="w-full bg-white/50 rounded-2xl p-4 font-bold text-xs outline-none border border-slate-200 focus:border-indigo-500 text-slate-700"
                            placeholder="CONTOH: MELATI"
                            value={newRoomData.id}
                            onChange={e => setNewRoomData({ ...newRoomData, id: e.target.value.toUpperCase().replace(/\s/g, '') })}
                          />
                        </div>
                        <div className="space-y-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Nama Ruangan</span>
                          <input
                            type="text"
                            className="w-full bg-white/50 rounded-2xl p-4 font-bold text-xs outline-none border border-slate-200 focus:border-indigo-500 text-slate-700"
                            placeholder="Ruang Melati"
                            value={newRoomData.name}
                            onChange={e => setNewRoomData({ ...newRoomData, name: e.target.value })}
                          />
                        </div>
                        <button onClick={handleAddRoom} className="bg-indigo-600 text-white p-4 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 hover:bg-indigo-700 transition-all flex justify-center items-center gap-2">
                          <Plus size={18} /> Tambah
                        </button>
                      </div>
                    </div>

                    {/* ADMIN: MANAJEMEN AKUN RUANGAN */}
                    <div className="mt-12 pt-10 border-t border-slate-200 relative z-10">
                      <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 ml-1">Manajemen Akun Petugas</h5>

                      {/* INFO OFFICER PASSWORD */}
                      <div className="p-6 bg-sky-50/50 rounded-[2rem] flex flex-col md:flex-row gap-6 items-center border border-sky-100 shadow-sm mb-6">
                        <div className="w-full md:w-1/4">
                          <label className="text-xs font-black uppercase text-sky-700 block mb-1">Petugas Informasi</label>
                          <span className="text-[10px] bg-sky-100 text-sky-500 font-bold px-2 py-1 rounded-lg">ID: informasi</span>
                        </div>
                        <div className="flex gap-4 w-full md:w-3/4 items-end">
                          <div className="flex-1 space-y-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Password Akses</span>
                            <input
                              type="text"
                              className="w-full bg-white rounded-xl p-3 text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-sky-100"
                              value={authSettings.infoPassword || '123'}
                              onChange={e => setAuthSettings({ ...authSettings, infoPassword: e.target.value })}
                            />
                          </div>
                          <button onClick={() => updateCredentials(authSettings)} className="bg-sky-500 text-white p-3 rounded-xl shadow-lg shadow-sky-500/30 hover:bg-sky-600 transition-colors"><Save size={18} /></button>
                        </div>
                      </div>

                      {/* PUBLIC UNLOCK CODE (KODE GEMBOK) */}
                      <div className="p-6 bg-emerald-50/50 rounded-[2rem] flex flex-col md:flex-row gap-6 items-center border border-emerald-100 shadow-sm mb-6">
                        <div className="w-full md:w-1/4">
                          <label className="text-xs font-black uppercase text-emerald-700 block mb-1">Kode Akses Buka Nama</label>
                          <span className="text-[10px] bg-emerald-100 text-emerald-500 font-bold px-2 py-1 rounded-lg">Utk: Tombol Gembok</span>
                        </div>
                        <div className="flex gap-4 w-full md:w-3/4 items-end">
                          <div className="flex-1 space-y-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Kode Rahasia</span>
                            <input
                              type="text"
                              className="w-full bg-white rounded-xl p-3 text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-emerald-100"
                              value={authSettings.publicAccessCode || '123'}
                              onChange={e => setAuthSettings({ ...authSettings, publicAccessCode: e.target.value })}
                            />
                          </div>
                          <button onClick={() => updateCredentials(authSettings)} className="bg-emerald-500 text-white p-3 rounded-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-colors"><Save size={18} /></button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        {rooms.map(room => {
                          const creds = authSettings.roomAccess?.[room.id] || { username: room.id.toLowerCase(), password: '123' };
                          return (
                            <div key={room.id} className="p-6 bg-white/40 rounded-[2rem] flex flex-col md:flex-row gap-6 items-center border border-white/60 shadow-sm hover:shadow-md transition-all">
                              <div className="w-full md:w-1/4">
                                <label className="text-xs font-black uppercase text-indigo-700 block mb-1">{room.name}</label>
                                <span className="text-[10px] bg-indigo-50 text-indigo-400 font-bold px-2 py-1 rounded-lg">ID: {room.id}</span>
                              </div>
                              <div className="flex gap-4 w-full md:w-3/4 items-end">
                                <div className="flex-1 space-y-2">
                                  <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Nama Ruangan</span>
                                  <input
                                    type="text"
                                    className="w-full bg-white rounded-xl p-3 text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-indigo-100"
                                    value={roomNameEdits[room.id] || room.name}
                                    onChange={e => setRoomNameEdits({ ...roomNameEdits, [room.id]: e.target.value })}
                                  />
                                </div>
                                <div className="flex-1 space-y-2">
                                  <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Username</span>
                                  <input
                                    type="text"
                                    className="w-full bg-white rounded-xl p-3 text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-indigo-100"
                                    value={creds.username}
                                    onChange={e => {
                                      const newUsername = e.target.value;
                                      setAuthSettings(prev => ({
                                        ...prev,
                                        roomAccess: {
                                          ...prev.roomAccess,
                                          [room.id]: { ...creds, username: newUsername }
                                        }
                                      }))
                                    }}
                                  />
                                </div>
                                <div className="flex-1 space-y-2">
                                  <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Password</span>
                                  <input
                                    type="text"
                                    className="w-full bg-white rounded-xl p-3 text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-indigo-100"
                                    value={creds.password}
                                    onChange={e => {
                                      const newPass = e.target.value;
                                      setAuthSettings(prev => ({
                                        ...prev,
                                        roomAccess: {
                                          ...prev.roomAccess,
                                          [room.id]: { ...creds, password: newPass }
                                        }
                                      }))
                                    }}
                                  />
                                </div>
                                <button onClick={() => saveRoomConfiguration(room.id, roomNameEdits[room.id] || room.name, creds.username, creds.password)} className="bg-emerald-500 text-white p-3 rounded-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-colors"><Save size={18} /></button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </GlassContainer>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* --- UNIFIED LOGIN MODAL --- */}
        {showLoginModal && (
          <div className="fixed inset-0 z-[3000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in-95 duration-300">
            <GlassContainer className="w-full max-w-sm rounded-[3rem] p-10 shadow-2xl relative text-center !bg-white">
              <button onClick={() => { setShowLoginModal(false); setLoginUsername(''); setLoginPassword(''); }} className="absolute top-8 right-8 text-slate-300 hover:text-slate-500 transition-colors"><X /></button>
              <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center text-indigo-600 mb-6 shadow-inner"><KeyRound size={40} /></div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-800">Login Petugas</h3>
                <p className="text-xs font-bold text-slate-400 mt-2">Masukkan kredensial Anda</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="relative group">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                  <input
                    type="text"
                    placeholder="Username"
                    className="w-full bg-slate-50 rounded-2xl py-4 pl-14 pr-4 font-bold text-sm outline-none border border-transparent focus:border-indigo-500 focus:bg-white transition-all text-slate-700"
                    value={loginUsername}
                    onChange={e => setLoginUsername(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        loginPassRef.current.focus();
                      }
                    }}
                  />
                </div>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                  <input
                    ref={loginPassRef}
                    type="password"
                    placeholder="Password"
                    className="w-full bg-slate-50 rounded-2xl py-4 pl-14 pr-4 font-bold text-sm outline-none border border-transparent focus:border-indigo-500 focus:bg-white transition-all text-slate-700"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                  />
                </div>
                <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl shadow-indigo-600/30 mt-4 active:scale-95 transition-all hover:bg-indigo-700">Masuk Sistem</button>
              </form>
            </GlassContainer>
          </div>
        )}

        {/* --- MODAL INPUT PASIEN --- */}
        {isPatientModalOpen && (
          <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in zoom-in-95 duration-300">
            <div className="absolute inset-0" onClick={() => setIsPatientModalOpen(false)}></div>
            <GlassContainer className={`relative w-full ${['IGD', 'IGD PONEK'].includes(patientFormData.room) || (!['OK (BEDAH SENTRAL)', 'HEMODIALISA'].includes(patientFormData.room) && patientFormData.room !== '') ? 'max-w-4xl' : 'max-w-lg'} rounded-[3rem] shadow-2xl overflow-hidden bg-white/80 backdrop-blur-xl border border-white/50 flex flex-col max-h-[85vh]`}>
              <div className="shrink-0 px-10 py-6 border-b border-slate-200 flex justify-between items-center bg-white/50 backdrop-blur-sm">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">
                      {['IGD', 'IGD PONEK'].includes(patientFormData.room) ? 'Formulir Laporan IGD & PONEK' : 'Data Pasien'}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                      {['IGD', 'IGD PONEK'].includes(patientFormData.room) ? 'Sesuai Standar Laporan UGD 2025' : 'Input Data Ruangan'}
                  </p>
                </div>
                <button onClick={() => setIsPatientModalOpen(false)} className="p-3 hover:bg-white/50 text-slate-500 rounded-full transition-all"><X size={20} /></button>
              </div>

              <div className="overflow-y-auto p-8 scrollbar-hide flex-1">
                <form onSubmit={handlePatientSubmit} className="space-y-6">

                  {/* =====================================================
                      LAYOUT KHUSUS UNTUK IGD & PONEK
                      =====================================================
                  */}
                  {['IGD', 'IGD PONEK'].includes(patientFormData.room) ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* KOLOM KIRI: IDENTITAS & MEDIS */}
                          <div className="space-y-6">
                              <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest border-b border-indigo-100 pb-2 mb-4">1. Identitas & Medis</h4>
                              
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">No. Rekam Medis</label>
                                      <input required className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.mrn} onChange={e => setPatientFormData({ ...patientFormData, mrn: e.target.value })} placeholder="00-00-00" />
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">NIK / No BPJS</label>
                                      <input className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.nik} onChange={e => setPatientFormData({ ...patientFormData, nik: e.target.value })} placeholder="16 Digit NIK" />
                                  </div>
                              </div>

                              <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Nama Pasien</label>
                                  <input required className="w-full bg-white rounded-xl py-3 px-4 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.name} onChange={e => setPatientFormData({ ...patientFormData, name: e.target.value })} placeholder="Nama Lengkap" />
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Jenis Kelamin</label>
                                      <select className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.gender} onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}>
                                          <option value="Laki-Laki">Laki-Laki</option>
                                          <option value="Perempuan">Perempuan</option>
                                      </select>
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Tanggal Lahir</label>
                                      <input 
                                        type="date" 
                                        className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" 
                                        value={patientFormData.birthDate} 
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const { years, months, days } = calculateAgeDetail(val);
                                          setPatientFormData({ 
                                            ...patientFormData, 
                                            birthDate: val,
                                            age: years,
                                            ageMonth: months,
                                            ageDay: days
                                          });
                                        }} 
                                      />
                                  </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Umur (Thn)</label>
                                      <input type="number" required className="w-full bg-white rounded-xl py-3 px-2 text-center text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.age} onChange={e => setPatientFormData({ ...patientFormData, age: e.target.value })} placeholder="0" />
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Bulan</label>
                                      <input type="number" className="w-full bg-white rounded-xl py-3 px-2 text-center text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.ageMonth} onChange={e => setPatientFormData({ ...patientFormData, ageMonth: e.target.value })} placeholder="0" />
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Hari</label>
                                      <input type="number" className="w-full bg-white rounded-xl py-3 px-2 text-center text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.ageDay} onChange={e => setPatientFormData({ ...patientFormData, ageDay: e.target.value })} placeholder="0" />
                                  </div>
                              </div>

                              <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Alamat Domisili</label>
                                  <textarea rows="2" className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500 resize-none" value={patientFormData.address} onChange={e => setPatientFormData({ ...patientFormData, address: e.target.value })} placeholder="Alamat lengkap..." />
                              </div>

                              <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Dokter IGD</label>
                                  <input className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.doctorIGD} onChange={e => setPatientFormData({ ...patientFormData, doctorIGD: e.target.value })} placeholder="Nama Dokter Jaga" />
                              </div>

                              <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Dokter DPJP</label>
                                  <input className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.doctorDPJP} onChange={e => setPatientFormData({ ...patientFormData, doctorDPJP: e.target.value })} placeholder="Nama Dokter DPJP" />
                              </div>
                          </div>

                          {/* KOLOM KANAN: STATUS, DIAGNOSA, KELUAR */}
                          <div className="space-y-6">
                              <h4 className="text-xs font-black text-emerald-500 uppercase tracking-widest border-b border-emerald-100 pb-2 mb-4">2. Status & Tindakan</h4>
                              
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Keterangan Masuk</label>
                                      <select className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.entryStatus} onChange={e => setPatientFormData({ ...patientFormData, entryStatus: e.target.value })}>
                                          <option value="Non Rujukan">Non Rujukan</option>
                                          <option value="Rujukan Puskesmas">Rujukan Puskesmas</option>
                                          <option value="Rujukan Faskes Lain">Rujukan Faskes Lain</option>
                                          <option value="Rujukan RS Lain">Rujukan RS Lain</option>
                                      </select>
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Cara Bayar</label>
                                      <select className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.paymentStatus} onChange={e => setPatientFormData({ ...patientFormData, paymentStatus: e.target.value })}>
                                          <option value="BPJS">JKN / BPJS</option>
                                          <option value="Umum">UMUM</option>
                                          <option value="GR">GR</option>
                                      </select>
                                  </div>
                              </div>

                              <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Jenis Pelayanan</label>
                                  <select className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.serviceType} onChange={e => setPatientFormData({ ...patientFormData, serviceType: e.target.value })}>
                                      <option value="Bedah - KLL Darat">Bedah - KLL Darat</option>
                                      <option value="Bedah - KLL Perairan">Bedah - KLL Perairan</option>
                                      <option value="Bedah - KLL Udara">Bedah - KLL Udara</option>
                                      <option value="Bedah - Lainnya (Non KLL)">Bedah - Lainnya (Non KLL)</option>
                                      <option value="Non Bedah - Kekerasan Perempuan (≥18 tahun)">Non Bedah - Kekerasan Perempuan (≥18 thn)</option>
                                      <option value="Non Bedah - Kekerasan Anak (<18 tahun)">Non Bedah - Kekerasan Anak (&lt;18 thn)</option>
                                      <option value="Non Bedah - Kekerasan Lainnya">Non Bedah - Kekerasan Lainnya</option>
                                      <option value="Non Bedah Lainnya">Non Bedah Lainnya</option>
                                      <option value="Kebidanan">Kebidanan</option>
                                      <option value="Psikiatrik">Psikiatrik</option>
                                      <option value="Bayi">Bayi</option>
                                      <option value="Anak">Anak</option>
                                      <option value="Geriatri">Geriatri</option>
                                  </select>
                              </div>

                              <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Diagnosa Utama</label>
                                  <textarea rows="2" className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-emerald-500 resize-none" value={patientFormData.diagnosisPrimary} onChange={e => setPatientFormData({ ...patientFormData, diagnosisPrimary: e.target.value })} placeholder="Diagnosa ICD-10" />
                              </div>

                              <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Diagnosa Sekunder</label>
                                  <textarea rows="2" className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-emerald-500 resize-none" value={patientFormData.diagnosisSecondary} onChange={e => setPatientFormData({ ...patientFormData, diagnosisSecondary: e.target.value })} placeholder="Diagnosa Tambahan" />
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Tindak Lanjut</label>
                                      <select className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.followUp} onChange={e => setPatientFormData({ ...patientFormData, followUp: e.target.value })}>
                                          <option value="Dirawat">Dirawat</option>
                                          <option value="Dirujuk">Dirujuk</option>
                                          <option value="Pulang">Pulang</option>
                                      </select>
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Ket. Keluar</label>
                                      <input className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.exitNote} onChange={e => setPatientFormData({ ...patientFormData, exitNote: e.target.value })} placeholder="Cth: R. PDL / Rawat Jalan" />
                                  </div>
                              </div>
                              
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-3">
                                  <label className="flex items-center space-x-2 cursor-pointer checkbox-wrapper">
                                      <input type="checkbox" className="hidden" checked={patientFormData.isDeadInIGD} onChange={e => setPatientFormData({...patientFormData, isDeadInIGD: e.target.checked})} />
                                      <div className="w-5 h-5 border-2 border-slate-300 rounded flex items-center justify-center transition-colors bg-white"><Check size={12} className="text-white hidden" strokeWidth={4} /></div>
                                      <span className="text-[10px] font-bold text-slate-600 uppercase">Meninggal di IGD</span>
                                  </label>
                                  <label className="flex items-center space-x-2 cursor-pointer checkbox-wrapper">
                                      <input type="checkbox" className="hidden" checked={patientFormData.isDOA} onChange={e => setPatientFormData({...patientFormData, isDOA: e.target.checked})} />
                                      <div className="w-5 h-5 border-2 border-slate-300 rounded flex items-center justify-center transition-colors bg-white"><Check size={12} className="text-white hidden" strokeWidth={4} /></div>
                                      <span className="text-[10px] font-bold text-slate-600 uppercase">DOA</span>
                                  </label>
                                  <label className="flex items-center space-x-2 cursor-pointer checkbox-wrapper">
                                      <input type="checkbox" className="hidden" checked={patientFormData.isInjury} onChange={e => setPatientFormData({...patientFormData, isInjury: e.target.checked})} />
                                      <div className="w-5 h-5 border-2 border-slate-300 rounded flex items-center justify-center transition-colors bg-white"><Check size={12} className="text-white hidden" strokeWidth={4} /></div>
                                      <span className="text-[10px] font-bold text-slate-600 uppercase">Luka-Luka</span>
                                  </label>
                                  <label className="flex items-center space-x-2 cursor-pointer checkbox-wrapper">
                                      <input type="checkbox" className="hidden" checked={patientFormData.isFalseEmergency} onChange={e => setPatientFormData({...patientFormData, isFalseEmergency: e.target.checked})} />
                                      <div className="w-5 h-5 border-2 border-slate-300 rounded flex items-center justify-center transition-colors bg-white"><Check size={12} className="text-white hidden" strokeWidth={4} /></div>
                                      <span className="text-[10px] font-bold text-slate-600 uppercase">False Emergency</span>
                                  </label>
                              </div>
                          </div>
                      </div>
                  ) : !['OK (BEDAH SENTRAL)', 'HEMODIALISA'].includes(patientFormData.room) ? (
                    /* FORMULIR KHUSUS RAWAT INAP (SELAIN IGD, OK, HD) */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest border-b border-indigo-100 pb-2 mb-4">1. Identitas Pasien</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">No. Rekam Medis</label>
                                <input required className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.mrn} onChange={e => setPatientFormData({ ...patientFormData, mrn: e.target.value })} placeholder="00-00-00" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">NIK / No BPJS</label>
                                <input className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.nik} onChange={e => setPatientFormData({ ...patientFormData, nik: e.target.value })} placeholder="16 Digit NIK" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Nama Pasien</label>
                            <input required className="w-full bg-white rounded-xl py-3 px-4 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.name} onChange={e => setPatientFormData({ ...patientFormData, name: e.target.value })} placeholder="Nama Lengkap" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Jenis Kelamin</label>
                                <select className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.gender} onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}>
                                    <option value="Laki-Laki">Laki-Laki</option>
                                    <option value="Perempuan">Perempuan</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Tanggal Lahir</label>
                                <input 
                                  type="date" 
                                  className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" 
                                  value={patientFormData.birthDate} 
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const { years, months, days } = calculateAgeDetail(val);
                                    setPatientFormData({ 
                                      ...patientFormData, 
                                      birthDate: val,
                                      age: years,
                                      ageMonth: months,
                                      ageDay: days
                                    });
                                  }} 
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Umur (Thn)</label>
                                <input type="number" required className="w-full bg-white rounded-xl py-3 px-2 text-center text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.age} onChange={e => setPatientFormData({ ...patientFormData, age: e.target.value })} placeholder="0" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Bulan</label>
                                <input type="number" className="w-full bg-white rounded-xl py-3 px-2 text-center text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.ageMonth} onChange={e => setPatientFormData({ ...patientFormData, ageMonth: e.target.value })} placeholder="0" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Hari</label>
                                <input type="number" className="w-full bg-white rounded-xl py-3 px-2 text-center text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.ageDay} onChange={e => setPatientFormData({ ...patientFormData, ageDay: e.target.value })} placeholder="0" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Alamat Domisili</label>
                            <textarea rows="2" className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500 resize-none" value={patientFormData.address} onChange={e => setPatientFormData({ ...patientFormData, address: e.target.value })} placeholder="Alamat lengkap..." />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-indigo-500 uppercase tracking-widest border-b border-indigo-100 pb-2 mb-4">2. Data Perawatan & Diagnosa</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Tanggal Masuk</label>
                                <input type="date" className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.admissionDate} onChange={e => setPatientFormData({...patientFormData, admissionDate: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Tanggal Keluar</label>
                                <input type="date" className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.outcomeDate} onChange={e => setPatientFormData({...patientFormData, outcomeDate: e.target.value})} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Kelas Perawatan</label>
                                <select className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.classRoom} onChange={e => setPatientFormData({...patientFormData, classRoom: e.target.value})}>
                                    <option value="VIP">VIP</option>
                                    <option value="I">Kelas I</option>
                                    <option value="II">Kelas II</option>
                                    <option value="III">Kelas III</option>
                                    <option value="Khusus">Khusus</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Hari Perawatan (HP)</label>
                                <input type="number" className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Jml Hari" value={patientFormData.hp} onChange={e => setPatientFormData({...patientFormData, hp: e.target.value})} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Dokter DPJP</label>
                                <input className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Nama DPJP" value={patientFormData.doctorDPJP} onChange={e => setPatientFormData({...patientFormData, doctorDPJP: e.target.value})} />
                           </div>
                           <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Dokter Konsul</label>
                                <input className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Nama Dr. Konsul" value={patientFormData.doctorKonsul} onChange={e => setPatientFormData({...patientFormData, doctorKonsul: e.target.value})} />
                           </div>
                        </div>

                        <div className="space-y-1">
                             <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Diagnosa Utama</label>
                             <textarea rows="1" className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500 resize-none" placeholder="Diagnosa Utama" value={patientFormData.diagnosisPrimary} onChange={e => setPatientFormData({...patientFormData, diagnosisPrimary: e.target.value})} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Kode ICD-10</label>
                                <input className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Kode ICD" value={patientFormData.icd10Code} onChange={e => setPatientFormData({...patientFormData, icd10Code: e.target.value})} />
                           </div>
                           <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Tarif (Rp)</label>
                                <input type="number" className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Nominal" value={patientFormData.tariff} onChange={e => setPatientFormData({...patientFormData, tariff: e.target.value})} />
                           </div>
                        </div>

                        <div className="space-y-1">
                             <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Diagnosa Sekunder</label>
                             <textarea rows="1" className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500 resize-none" placeholder="Diagnosa Tambahan" value={patientFormData.diagnosisSecondary} onChange={e => setPatientFormData({...patientFormData, diagnosisSecondary: e.target.value})} />
                        </div>

                        <div className="space-y-1">
                             <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Tindakan</label>
                             <input className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Tindakan Medis" value={patientFormData.action} onChange={e => setPatientFormData({...patientFormData, action: e.target.value})} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Cara Bayar</label>
                                <select className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.paymentStatus} onChange={e => setPatientFormData({...patientFormData, paymentStatus: e.target.value})}>
                                    <option value="BPJS">BPJS</option>
                                    <option value="Umum">Umum</option>
                                    <option value="GR">GR</option>
                                </select>
                           </div>
                           {patientFormData.paymentStatus === 'BPJS' && (
                               <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Jenis JKN</label>
                                    <select className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.jknType} onChange={e => setPatientFormData({...patientFormData, jknType: e.target.value})}>
                                        <option value="PBI (APBD)">PBI (APBD)</option>
                                        <option value="PBI (Provinsi)">PBI (Provinsi)</option>
                                        <option value="PBI (APBN)">PBI (APBN)</option>
                                        <option value="Mandiri">Mandiri</option>
                                        <option value="PPU">PPU</option>
                                    </select>
                               </div>
                           )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Status Keluar</label>
                                <select className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.status} onChange={e => setPatientFormData({...patientFormData, status: e.target.value})}>
                                    <option value="Dirawat /Inap">Dirawat /Inap</option>
                                    <option value="BLPL">BLPL</option>
                                    <option value="APS">APS</option>
                                    <option value="Pindah Ruangan">Pindah Ruangan</option>
                                    <option value="Rujuk">Rujuk</option>
                                    <option value="Meninggal">Meninggal</option>
                                </select>
                           </div>
                           <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-500 uppercase ml-1">Keterangan Lain</label>
                                <input className="w-full bg-white rounded-xl py-3 px-4 text-xs font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Catatan" value={patientFormData.notes} onChange={e => setPatientFormData({...patientFormData, notes: e.target.value})} />
                           </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* =====================================================
                        LAYOUT STANDAR (Untuk OK & Hemodialisa)
                        =====================================================
                    */
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Nama Pasien</label>
                          <input required className="w-full bg-white rounded-2xl py-4 px-5 outline-none border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-slate-800 placeholder:text-slate-300" value={patientFormData.name} onChange={e => setPatientFormData({...patientFormData, name: e.target.value})} placeholder="Nama Lengkap" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Jenis Kelamin</label>
                          <select className="w-full bg-white rounded-2xl py-4 px-5 outline-none border border-slate-200 font-bold text-slate-800 appearance-none cursor-pointer focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all" value={patientFormData.gender} onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}>
                            <option value="Laki-Laki">Laki-Laki</option>
                            <option value="Perempuan">Perempuan</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Alamat Domisili</label>
                          <textarea required rows="2" placeholder="Alamat Lengkap Pasien" className="w-full bg-white rounded-2xl py-4 px-5 outline-none border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all font-bold text-slate-800 resize-none placeholder:text-slate-300" value={patientFormData.address} onChange={e => setPatientFormData({...patientFormData, address: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Usia (Thn)</label>
                           <input required type="number" className="w-full bg-white rounded-2xl py-4 px-5 outline-none border border-slate-200 font-bold text-slate-800 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all" value={patientFormData.age} onChange={e => setPatientFormData({ ...patientFormData, age: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">Ruangan</label>
                           <input required disabled={!!loggedInRoomId} className="w-full bg-indigo-50 rounded-2xl py-4 px-5 outline-none border border-indigo-100 font-black text-indigo-600 cursor-not-allowed" value={patientFormData.room} onChange={e => setPatientFormData({ ...patientFormData, room: e.target.value })} />
                        </div>
                      </div>

                      {/* KHUSUS OK: JENIS OPERASI */}
                      {(patientFormData.room.toUpperCase().includes('OK') || patientFormData.room.toUpperCase().includes('BEDAH')) && (
                        <div className="space-y-2 animate-in slide-in-from-top-4 fade-in">
                          <label className="text-[10px] font-black text-pink-600 uppercase tracking-widest ml-1 flex items-center gap-1"><Syringe size={12}/> Jenis Operasi</label>
                          <div className="relative">
                            <select className="w-full bg-pink-50 rounded-2xl py-4 px-5 outline-none border border-pink-200 font-bold text-slate-800 appearance-none cursor-pointer focus:border-pink-500 focus:ring-4 focus:ring-pink-100 transition-all" value={patientFormData.jenisOperasi} onChange={e => setPatientFormData({ ...patientFormData, jenisOperasi: e.target.value })}>
                              <option value="">-- Pilih Jenis Operasi --</option>
                              <option value="Obgyn Elektif">1. Obgyn Elektif</option>
                              <option value="Obgyn Cito">2. Obgyn Cito</option>
                              <option value="Bedah Umum">3. Bedah Umum</option>
                            </select>
                            <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 text-pink-400 rotate-90 pointer-events-none" size={16} />
                          </div>
                        </div>
                      )}

                      {/* TANGGAL MASUK & STATUS PASIEN */}
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Tanggal Masuk</label>
                           <input type="date" required className="w-full bg-white rounded-2xl py-4 px-5 outline-none border border-slate-200 font-bold text-slate-800 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all cursor-pointer" value={patientFormData.admissionDate} onChange={e => setPatientFormData({ ...patientFormData, admissionDate: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Status Pasien</label>
                           <select className="w-full bg-white rounded-2xl py-4 px-5 outline-none border border-slate-200 font-bold text-slate-800 appearance-none cursor-pointer focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all" value={patientFormData.paymentStatus} onChange={e => setPatientFormData({ ...patientFormData, paymentStatus: e.target.value })}>
                             <option value="BPJS">BPJS</option>
                             <option value="Umum">Umum</option>
                             <option value="GR">GR</option>
                           </select>
                        </div>
                      </div>

                      {!patientFormData.room.toUpperCase().includes('OK') && (
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Status Perawatan</label>
                           <select className="w-full bg-white rounded-2xl py-4 px-5 outline-none border border-slate-200 font-bold text-slate-800 appearance-none cursor-pointer focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all" value={patientFormData.status} onChange={e => { const newStatus = e.target.value; setPatientFormData(prev => ({ ...prev, status: newStatus, outcomeDate: (newStatus !== 'Dirawat /Inap' && !prev.outcomeDate) ? new Date().toISOString().split('T')[0] : prev.outcomeDate })); }}>
                             <option value="Dirawat /Inap">Dirawat /Inap</option>
                             <option value="Pulang (BLPL)">Pulang (BLPL)</option>
                             <option value="Pulang (APS)">Pulang (APS)</option>
                             <option value="Di rujuk">Di rujuk</option>
                             <option value="Meninggal Dunia">Meninggal Dunia</option>
                           </select>
                        </div>
                      )}

                      {patientFormData.status !== 'Dirawat /Inap' && (
                        <div className="space-y-2 animate-in slide-in-from-top-4 fade-in">
                          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Tanggal {patientFormData.status.includes('Meninggal') ? 'Meninggal' : 'Keluar'}</label>
                          <input type="date" required className="w-full bg-white rounded-2xl py-4 px-5 outline-none border border-slate-200 font-bold text-slate-800 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all" value={patientFormData.outcomeDate} onChange={e => setPatientFormData({ ...patientFormData, outcomeDate: e.target.value })} />
                        </div>
                      )}
                    </div>
                  )}
                  <button type="submit" disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase shadow-xl flex items-center justify-center gap-3 mt-4 transition-all hover:bg-indigo-700 hover:shadow-2xl active:scale-95">
                    {isSaving ? <><Loader2 size={20} className="animate-spin" /> MENYIMPAN...</> : <><CheckCircle size={20} /> {editingPatient ? 'PERBARUI DATA' : 'SIMPAN DATA'}</>}
                  </button>
                </form>
              </div>
            </GlassContainer>
          </div>
        )}
      </div>
    </>
  );
};

export default App;
