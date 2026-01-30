/**
 * ============================================================================
 * SIPAS (Sistem Informasi Pasien & Administrasi Rumah Sakit)
 * RSUD LEBONG - Single File Application (React & Firebase)
 * * Deskripsi:
 * Aplikasi ini digunakan untuk manajemen pelaporan harian pasien, 
 * pendaftaran pasien baru, pencarian data pasien, dan ekspor laporan ke Excel.
 * * Versi: 2.6 (Fixed Auto-Recap for IGD/PONEK & Clean UI)
 * ============================================================================
 */

import React, { 
  useState, 
  useEffect, 
  useMemo, 
  useRef, 
  useCallback, 
  memo 
} from 'react';

// Import Icons dari Lucide React
import {
  Trash2, Save, Users, Home, Heart, Settings,
  Activity, CheckCircle, ChevronRight, Plus, X, Lock, LogOut,
  BarChart3, LayoutDashboard, ClipboardList, Edit3, Loader2, Baby, ShieldPlus,
  Stethoscope, Zap, Scissors, Droplets, KeyRound, AlertTriangle, ShieldCheck,
  Search, ShieldAlert, FileSpreadsheet, Download, Check, UserPlus, User,
  CalendarDays, CalendarRange, BookOpen, Bed,
  Siren, Ear, Smile, Wind, Brain, Eye, Bone, Pill
} from 'lucide-react';

// Import Firebase Modules
import { initializeApp } from "firebase/app";
import {
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc,
  onSnapshot, 
  setDoc,
  query
} from "firebase/firestore";
import {
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithCustomToken
} from "firebase/auth";

// ============================================================================
// --- KONFIGURASI & INITIALISASI FIREBASE ---
// ============================================================================

/**
 * Konfigurasi Firebase untuk RSUD LEBONG
 */
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyCaHD5UUYK2YXEDRW2ICGJE9M6Wy57ZBGo",
  authDomain: "sipas-rsud-lebong-e6a43.firebaseapp.com",
  projectId: "sipas-rsud-lebong-e6a43",
  storageBucket: "sipas-rsud-lebong-e6a43.firebasestorage.app",
  messagingSenderId: "477611720744",
  appId: "1:477611720744:web:743147bc25512317caf51d",
};

// Inisialisasi Instance Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'sipas-rsud-lebong-e6a43';

// ============================================================================
// --- FUNGSI UTILITAS / HELPER ---
// ============================================================================

/**
 * Mengonversi teks string ke format Base64 yang aman untuk URL/Data
 * @param {string} text - Teks yang akan dikonversi
 */
const toBase64 = (text) => {
  try {
    return btoa(
      encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (match, p1) => 
        String.fromCharCode('0x' + p1)
      )
    );
  } catch (e) { 
    return text; 
  }
};

/**
 * Mendekode string Base64 kembali ke teks asli
 * @param {string} str - String Base64
 */
const fromBase64 = (str) => {
  try {
    return decodeURIComponent(
      Array.prototype.map.call(atob(str), (c) => 
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('')
    );
  } catch (e) { 
    return str; 
  }
};

/**
 * Fungsi Enkripsi Sederhana (XOR + Base64)
 * Digunakan untuk mengamankan data pasien di database
 * @param {string} text - Teks mentah
 * @param {string} key - Kunci enkripsi
 */
const encrypt = (text, key) => {
  if (text === undefined || text === null || !key) return text;
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

/**
 * Fungsi Dekripsi Sederhana
 * @param {string} encoded - Teks terenkripsi (dengan prefix ENC:)
 * @param {string} key - Kunci dekripsi
 */
const decrypt = (encoded, key) => {
  if (!encoded || !key) return encoded;
  try {
    const strEncoded = String(encoded);
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

/**
 * Format Tanggal ISO ke format Indonesia (DD/MM/YYYY)
 * @param {string} dateStr - String tanggal (YYYY-MM-DD)
 */
const formatDateID = (dateStr) => {
  if (!dateStr || String(dateStr).startsWith('ENC:')) return '-';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Mengambil tanggal pelaporan saat ini.
 * Jika waktu di bawah jam 07:00 pagi, maka dianggap hari sebelumnya (Siklus RS).
 */
const getReportingDate = () => {
  const now = new Date();
  if (now.getHours() < 7) now.setDate(now.getDate() - 1);
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

/**
 * Menghitung detail usia (Tahun, Bulan, Hari) berdasarkan tanggal lahir
 * @param {string} birthDateStr - Tanggal lahir
 */
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

// ============================================================================
// --- GAYA & ANIMASI CSS ---
// ============================================================================

const animationStyles = `
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  
  .glass-sidebar {
    background: transparent;
    backdrop-filter: blur(15px);
    border-right: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
  
  input[type=number]::-webkit-inner-spin-button, 
  input[type=number]::-webkit-outer-spin-button { 
    -webkit-appearance: none; 
    margin: 0; 
  }
  
  input[type=number] { -moz-appearance: textfield; }
  
  .checkbox-wrapper input:checked + div { 
    background-color: #10b981; 
    border-color: #10b981; 
  }
  
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
      min-height: 100vh; 
      width: 100%;
  }
`;

// ============================================================================
// --- KONSTANTA & PEMETAAN DATA ---
// ============================================================================

const initialReportData = {
  date: getReportingDate(),
};

const iconMap = {
  'Heart': Heart, 'Home': Home, 'Activity': Activity, 'Zap': Zap,
  'Users': Users, 'Baby': Baby, 'ShieldPlus': ShieldPlus, 'Stethoscope': Stethoscope,
  'ShieldCheck': ShieldCheck, 'ShieldAlert': ShieldAlert, 'Scissors': Scissors, 'Droplets': Droplets,
  'BookOpen': BookOpen, 'Bed': Bed, 'Siren': Siren, 'Ear': Ear, 'Smile': Smile, 'Wind': Wind,
  'Brain': Brain, 'Eye': Eye, 'Bone': Bone, 'Pill': Pill
};

/**
 * Daftar Ruangan Default RSUD LEBONG
 */
const defaultRoomsList = [
  // IGD & Critical Units
  { id: 'IGD', name: 'IGD', defaultTT: 8, icon: 'Siren', ttKey: 'IGDTT', pasienKey: 'IGDPasien', bpjsKey: 'IGDBpjs', umumKey: 'IGDUmum', cardGradient: 'bg-gradient-to-br from-red-200 via-red-300 to-rose-300' },
  { id: 'PONEK', name: 'IGD PONEK', defaultTT: 4, icon: 'Baby', ttKey: 'PONEKTT', pasienKey: 'PONEKPasien', bpjsKey: 'PONEKBpjs', umumKey: 'PONEKUmum', cardGradient: 'bg-gradient-to-br from-pink-200 via-pink-300 to-rose-300' },
  { id: 'ICU', name: 'ICU', defaultTT: 6, icon: 'Activity', ttKey: 'ICUTT', pasienKey: 'ICUPasien', bpjsKey: 'ICUBpjs', umumKey: 'ICUUmum', cardGradient: 'bg-gradient-to-br from-indigo-200 via-indigo-300 to-blue-300' },
  { id: 'NICU', name: 'NICU', defaultTT: 6, icon: 'Baby', ttKey: 'NICUTT', pasienKey: 'NICUPasien', bpjsKey: 'NICUBpjs', umumKey: 'NICUUmum', cardGradient: 'bg-gradient-to-br from-teal-200 via-teal-300 to-emerald-300' },
  { id: 'PICU', name: 'PICU', defaultTT: 8, icon: 'Smile', ttKey: 'PICUTT', pasienKey: 'PICUPasien', bpjsKey: 'PICUBpjs', umumKey: 'PICUUmum', cardGradient: 'bg-gradient-to-br from-violet-200 via-violet-300 to-purple-300' },
  
  // Inpatient Wards
  { id: 'ASTER', name: 'ASTER (ANAK)', defaultTT: 23, icon: 'Bed', ttKey: 'ASTERTT', pasienKey: 'ASTERPasien', bpjsKey: 'ASTERBpjs', umumKey: 'ASTERUmum', cardGradient: 'bg-gradient-to-br from-amber-100 via-amber-200 to-orange-200' },
  { id: 'ANGGREK', name: 'ANGGREK (BEDAH)', defaultTT: 23, icon: 'Bed', ttKey: 'ANGGREKTT', pasienKey: 'ANGGREKPasien', bpjsKey: 'ANGGREKBpjs', umumKey: 'ANGGREKUmum', cardGradient: 'bg-gradient-to-br from-cyan-100 via-cyan-200 to-sky-200' },
  { id: 'AGLONEMA', name: 'AGLONEMA (INTERNA)', defaultTT: 24, icon: 'Bed', ttKey: 'AGLONEMATT', pasienKey: 'AGLONEMAPasien', bpjsKey: 'AGLONEMABpjs', umumKey: 'AGLONEMAUmum', cardGradient: 'bg-gradient-to-br from-blue-100 via-blue-200 to-indigo-200' },
  { id: 'KOHORT', name: 'KOHORT', defaultTT: 10, icon: 'Bed', ttKey: 'KOHORTTT', pasienKey: 'KOHORTPasien', bpjsKey: 'KOHORTBpjs', umumKey: 'KOHORTUmum', cardGradient: 'bg-gradient-to-br from-lime-100 via-lime-200 to-green-200' },
  { id: 'AZALEA', name: 'AZALEA (VIP)', defaultTT: 7, icon: 'Bed', ttKey: 'AZALEATT', pasienKey: 'AZALEAPasien', bpjsKey: 'AZALEABpjs', umumKey: 'AZALEAUmum', cardGradient: 'bg-gradient-to-br from-fuchsia-100 via-fuchsia-200 to-purple-200' },
  { id: 'ALAMANDA', name: 'ALAMANDA (KEBIDANAN)', defaultTT: 16, icon: 'Bed', ttKey: 'ALAMANDATT', pasienKey: 'ALAMANDAPasien', bpjsKey: 'ALAMANDABpjs', umumKey: 'ALAMANDAUmum', cardGradient: 'bg-gradient-to-br from-rose-100 via-rose-200 to-pink-200' },
  
  // Other Units
  { id: 'OK', name: 'OK (BEDAH SENTRAL)', defaultTT: 0, icon: 'Scissors', ttKey: 'OKTT', pasienKey: 'OKPasien', bpjsKey: 'OKBpjs', umumKey: 'OKUmum', cardGradient: 'bg-gradient-to-br from-emerald-100 via-emerald-200 to-teal-200' },
  { id: 'HD', name: 'UNIT DIALISIS', defaultTT: 4, icon: 'Droplets', ttKey: 'HDTT', pasienKey: 'HDPasien', bpjsKey: 'HDBpjs', umumKey: 'HDUmum', cardGradient: 'bg-gradient-to-br from-orange-100 via-orange-200 to-amber-200' },
  
  // Polyclinics
  { id: 'POLI_BEDAH', name: 'POLI BEDAH', defaultTT: 0, icon: 'Scissors', ttKey: 'PBEDAH_TT', pasienKey: 'PBEDAH_P', bpjsKey: 'PBEDAH_B', umumKey: 'PBEDAH_U', cardGradient: 'bg-gradient-to-br from-emerald-100 via-emerald-200 to-teal-200' },
  { id: 'POLI_KANDUNGAN', name: 'POLI KANDUNGAN', defaultTT: 0, icon: 'Baby', ttKey: 'POBGYN_TT', pasienKey: 'POBGYN_P', bpjsKey: 'POBGYN_B', umumKey: 'POBGYN_U', cardGradient: 'bg-gradient-to-br from-pink-100 via-pink-200 to-rose-200' },
  { id: 'POLI_ANAK', name: 'POLI ANAK', defaultTT: 0, icon: 'Smile', ttKey: 'PANAK_TT', pasienKey: 'PANAK_P', bpjsKey: 'PANAK_B', umumKey: 'PANAK_U', cardGradient: 'bg-gradient-to-br from-amber-100 via-amber-200 to-yellow-200' },
  { id: 'POLI_PENYAKIT_DALAM', name: 'POLI PENYAKIT DALAM', defaultTT: 0, icon: 'Heart', ttKey: 'PPD_TT', pasienKey: 'PPD_P', bpjsKey: 'PPD_B', umumKey: 'PPD_U', cardGradient: 'bg-gradient-to-br from-blue-100 via-blue-200 to-cyan-200' },
  { id: 'POLI_GIGI', name: 'POLI GIGI', defaultTT: 0, icon: 'Smile', ttKey: 'PGIGI_TT', pasienKey: 'PGIGI_P', bpjsKey: 'PGIGI_B', umumKey: 'PGIGI_U', cardGradient: 'bg-gradient-to-br from-teal-100 via-teal-200 to-cyan-200' },
  { id: 'POLI_THT', name: 'POLI THT', defaultTT: 0, icon: 'Ear', ttKey: 'PTHT_TT', pasienKey: 'PTHT_P', bpjsKey: 'PTHT_B', umumKey: 'PTHT_U', cardGradient: 'bg-gradient-to-br from-violet-100 via-violet-200 to-purple-200' },
  { id: 'POLI_TB', name: 'POLI TB', defaultTT: 0, icon: 'Wind', ttKey: 'PTB_TT', pasienKey: 'PTB_P', bpjsKey: 'PTB_B', umumKey: 'PTB_U', cardGradient: 'bg-gradient-to-br from-sky-100 via-sky-200 to-blue-200' },
  { id: 'POLI_UMUM', name: 'POLI UMUM', defaultTT: 0, icon: 'Stethoscope', ttKey: 'PUMUM_TT', pasienKey: 'PUMUM_P', bpjsKey: 'PUMUM_B', umumKey: 'PUMUM_U', cardGradient: 'bg-gradient-to-br from-green-100 via-green-200 to-emerald-200' },
  { id: 'POLI_FISIOTERAPI', name: 'POLI FISIOTERAPI', defaultTT: 0, icon: 'Activity', ttKey: 'PFISIO_TT', pasienKey: 'PFISIO_P', bpjsKey: 'PFISIO_B', umumKey: 'PFISIO_U', cardGradient: 'bg-gradient-to-br from-lime-100 via-lime-200 to-green-200' },
  { id: 'POLI_PSIKOLOG', name: 'POLI PSIKOLOG', defaultTT: 0, icon: 'Brain', ttKey: 'PPSI_TT', pasienKey: 'PPSI_P', bpjsKey: 'PPSI_B', umumKey: 'PPSI_U', cardGradient: 'bg-gradient-to-br from-fuchsia-100 via-fuchsia-200 to-purple-200' },
  { id: 'POLI_VCT', name: 'POLI VCT', defaultTT: 0, icon: 'Heart', ttKey: 'PVCT_TT', pasienKey: 'PVCT_P', bpjsKey: 'PVCT_B', umumKey: 'PVCT_U', cardGradient: 'bg-gradient-to-br from-rose-100 via-rose-200 to-red-200' },
  { id: 'POLI_LAIN', name: 'POLI SPESIALIS LAIN', defaultTT: 0, icon: 'Plus', ttKey: 'PLAIN_TT', pasienKey: 'PLAIN_P', bpjsKey: 'PLAIN_B', umumKey: 'PLAIN_U', cardGradient: 'bg-gradient-to-br from-slate-100 via-slate-200 to-gray-200' },
];

// ============================================================================
// --- SUB-KOMPONEN UI ---
// ============================================================================

/**
 * Kontainer Kaca (Frosted Glass Effect)
 */
const GlassContainer = ({ children, className = "" }) => (
  <div className={`bg-white/75 backdrop-blur-md border border-white/50 shadow-xl ${className}`}>
    {children}
  </div>
);

/**
 * Komponen Notifikasi (Toast)
 */
const Toast = ({ message, type, onClose }) => {
  useEffect(() => { 
    const timer = setTimeout(onClose, 2000); 
    return () => clearTimeout(timer); 
  }, [onClose]);

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[7000] animate-in slide-in-from-top-4 fade-in duration-300">
      <div className={`px-6 py-3 rounded-full shadow-lg flex items-center space-x-3 backdrop-blur-2xl border border-white/20 ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
        {type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
        <span className="text-xs font-bold uppercase tracking-wide">{message}</span>
      </div>
    </div>
  );
};

/**
 * Input Angka Khusus dengan gaya RSUD LEBONG
 */
const NumberInput = ({ 
  label, 
  value, 
  onChange, 
  onBlur, 
  bgClass = "bg-white/40", 
  textColor = "text-slate-800", 
  disabled = false 
}) => {
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
      <label className={`text-[9px] font-black ${textColor} opacity-70 uppercase mb-1.5 truncate tracking-wider`}>
        {label}
      </label>
      <input 
        type="number" 
        min="0" 
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

/**
 * Kartu Ruangan (Room Card)
 */
const RoomCard = memo(({ room, report, onChange, onSave, isAdmin, onDeleteRoom, onUpdateName }) => {
  const Icon = iconMap[room.icon] || Home;
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(room.name);
  const isPoli = room.name.includes('POLI'); 

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
      
      <div className="flex justify-between items-center mb-6 relative z-10 text-slate-800">
        <div className="flex items-center space-x-4 w-full">
          <div className="p-3 bg-white/40 rounded-2xl backdrop-blur-md shadow-inner shrink-0">
            <Icon size={22} className="text-slate-800" />
          </div>
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
                <button 
                  onMouseDown={(e) => e.preventDefault()} 
                  onClick={handleSaveName} 
                  className="p-1 bg-white/40 rounded-full hover:bg-white/60 text-slate-800 shadow-md transition-all shrink-0"
                >
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <h3 className="text-sm font-black uppercase truncate tracking-tight flex items-center gap-2 group/title text-slate-800">
                {room.name}
                {isAdmin && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsEditingName(true); }} 
                    className="p-1.5 bg-white/30 hover:bg-white/50 rounded-lg text-slate-700 transition-colors opacity-0 group-hover/title:opacity-100" 
                    title="Ubah Nama Ruangan"
                  >
                    <Edit3 size={12} />
                  </button>
                )}
              </h3>
            )}
            {!isPoli && <p className="text-[10px] font-bold opacity-60 tracking-widest text-slate-700">KAPASITAS: {report[room.ttKey] || room.defaultTT}</p>}
            {isPoli && <p className="text-[10px] font-bold opacity-60 tracking-widest text-slate-700">KUNJUNGAN HARI INI</p>}
          </div>
        </div>
        {isAdmin && (
          <button 
            onClick={() => onDeleteRoom(room.id)} 
            className="p-2.5 bg-white/30 text-slate-700 rounded-xl hover:bg-rose-500/80 hover:text-white transition-colors backdrop-blur-sm shrink-0 ml-2"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div className={`grid ${isPoli ? 'grid-cols-3' : 'grid-cols-4'} gap-2 bg-white/30 p-3 rounded-[2rem] backdrop-blur-sm relative z-10 border border-white/20`}>
        {!isPoli && (
          <NumberInput 
            label="TT" 
            value={report[room.ttKey] || room.defaultTT} 
            onChange={(val) => onChange(room.ttKey, val)} 
            onBlur={onSave} 
            bgClass="bg-white/50" 
            textColor="text-slate-800" 
          />
        )}
        <NumberInput 
          label={isPoli ? "TOTAL" : "PASIEN"} 
          value={report[room.pasienKey]} 
          onChange={(val) => onChange(room.pasienKey, val)} 
          bgClass="bg-white/60" 
          disabled={true} 
          textColor="text-slate-800" 
        />
        <NumberInput 
          label="BPJS" 
          value={report[room.bpjsKey]} 
          onChange={(val) => onChange(room.bpjsKey, val)} 
          bgClass="bg-white/60" 
          disabled={true} 
          textColor="text-slate-800" 
        />
        <NumberInput 
          label="UMUM" 
          value={report[room.umumKey]} 
          onChange={(val) => onChange(room.umumKey, val)} 
          bgClass="bg-white/60" 
          disabled={true} 
          textColor="text-slate-800" 
        />
      </div>
    </div>
  );
});

// ============================================================================
// --- KOMPONEN APLIKASI UTAMA ---
// ============================================================================

const App = () => {
  // --- A. DEKLARASI STATE ---
  
  // State Utama Aplikasi & Data
  const [activeTab, setActiveTab] = useState('dashboard');
  const [report, setReport] = useState(initialReportData);
  const [rooms, setRooms] = useState(defaultRoomsList);
  const [savedReports, setSavedReports] = useState([]);
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(null);
  const [dbStatus, setDbStatus] = useState('connecting');

  // State Auth & Hak Akses
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaffLoggedIn, setIsStaffLoggedIn] = useState(false);
  const [isInfoLoggedIn, setIsInfoLoggedIn] = useState(false);
  const [loggedInRoomId, setLoggedInRoomId] = useState(null);
  const [adminSelectedRoomId, setAdminSelectedRoomId] = useState('');

  // State UI & Pengeditan
  const [isSaving, setIsSaving] = useState(false);
  const [downloadRoomFilter, setDownloadRoomFilter] = useState('');
  const [downloadSettings, setDownloadSettings] = useState({
    month: new Date().toISOString().slice(0, 7), // Format: YYYY-MM
    mode: 'mtd' // Mode: 'full' (Sebulan) | 'mtd' (Bulan Berjalan)
  });
  const [roomNameEdits, setRoomNameEdits] = useState({});
  const [newRoomData, setNewRoomData] = useState({ name: '', id: '', hasUmum: true });
  const [authSettings, setAuthSettings] = useState({
    staffPassword: '123', 
    adminUsername: 'admin', 
    adminPassword: '123',
    infoPassword: '123', 
    publicAccessCode: '123', 
    roomAccess: {}
  });

  // State Modal & Pencarian
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ 
    isOpen: false, 
    type: '', 
    id: '', 
    message: '', 
    title: '' 
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const loginPassRef = useRef(null);

  // State Data Pasien & Keamanan
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState(''); 
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [isLocalSearchVisible, setIsLocalSearchVisible] = useState(false);
  const [searchRoomFilter, setSearchRoomFilter] = useState('');
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockKeyInput, setUnlockKeyInput] = useState('');
  const [editingPatient, setEditingPatient] = useState(null);
  const [patientMasterKey, setPatientMasterKey] = useState(sessionStorage.getItem('rs_session_key') || '');
  const [isPatientLocked, setIsPatientLocked] = useState(!sessionStorage.getItem('rs_session_key'));
  
  /**
   * Data Formulir Pasien Baru / Edit
   */
  const [patientFormData, setPatientFormData] = useState({
    name: '', age: '', room: '', address: '', gender: 'Laki-Laki',
    paymentStatus: 'BPJS', admissionDate: new Date().toISOString().split('T')[0],
    status: 'Dirawat /Inap', outcomeDate: '', 
    mrn: '', nik: '', birthDate: '', ageMonth: '', ageDay: '',
    doctorIGD: '', doctorIntern: '', doctorDPJP: '',
    diagnosisPrimary: '', diagnosisSecondary: '',
    entryStatus: 'Non Rujukan', serviceType: 'Non Bedah Lainnya',
    followUp: 'Observasi', exitNote: '',
    isDeadInIGD: false, isDOA: false, isInjury: false, isFalseEmergency: false,
    classRoom: 'III', jknType: 'PBI (APBD)', doctorKonsul: '',
    tariff: '', icd10Code: '', action: '', hp: '', notes: '',
    specialization: '', operationCategory: '', operationStatus: '',
    visitType: 'Baru', specializationManual: '', followUpService: 'Dirawat',
    birthWeight: '', nicuActions: [], nicuActionManual: ''
  });

  // Utility Notifikasi
  const showToast = (msg, type = 'success') => setToast({ message: msg, type });

  // --- B. SIDE EFFECTS & FIREBASE SUBSCRIPTIONS ---

  /**
   * Inisialisasi Auth saat komponen dimuat pertama kali
   */
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
      if (u) { 
        setUser(u); 
        setDbStatus('online'); 
      } else {
        setDbStatus('offline');
      }
    });
  }, []);

  /**
   * Auto Lock Session (Keamanan 5 Menit)
   * Mengunci kembali akses nama pasien jika tidak ada aktivitas admin/staff
   */
  useEffect(() => {
    let timer;
    if (!isPatientLocked && !isStaffLoggedIn && !isAdmin) {
      timer = setTimeout(() => {
        setIsPatientLocked(true);
        setPatientMasterKey('');
        sessionStorage.removeItem('rs_session_key');
        showToast("Sesi akses nama habis (Otomatis Terkunci)", "error");
      }, 5 * 60 * 1000); 
    }
    return () => clearTimeout(timer);
  }, [isPatientLocked, isStaffLoggedIn, isAdmin]);

  /**
   * Listener Utama Firestore (Real-time updates)
   */
  useEffect(() => {
    if (!user) return;

    // Listen Pengaturan Auth
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

    // Listen Data Ruangan
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

    // Listen Arsip Laporan Harian
    const unsubReports = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'reports'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sorted = data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setSavedReports(sorted);

      const currentReportingDate = getReportingDate();
      const currentData = sorted.find(r => r.date === currentReportingDate);
      if (currentData) setReport(prev => ({ ...prev, ...currentData }));
      else setReport({ ...initialReportData, date: currentReportingDate });
    });

    // Listen Data Pasien (Fixed Boolean & Full Mapping Decryption & JSON Parse Error)
    const unsubPatients = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'patients'), (snapshot) => {
      const decryptedData = snapshot.docs.map(doc => {
        const data = doc.data();
        const k = patientMasterKey;
        
        // Fungsi helper dekripsi cepat
        const d = (val) => decrypt(val, k);
        const maskIcon = '••••'; // Simbol titik-titik untuk sensor

        // Helper untuk membersihkan teks ENC: yang bocor jika dekripsi gagal
        const cleanENC = (text) => (String(text).startsWith('ENC:') ? maskIcon : text);

        // Dekripsi field string dasar
        const decName = d(data.name);
        const decNicuActions = d(data.nicuActions);

        // Petakan semua kolom yang dienkripsi dan pastikan tidak ada kebocoran ENC:
        const res = {
          id: doc.id,
          ...data,
          name: cleanENC(decName),
          age: cleanENC(d(data.age)),
          address: cleanENC(d(data.address)),
          room: cleanENC(d(data.room)),
          paymentStatus: cleanENC(d(data.paymentStatus)),
          gender: cleanENC(d(data.gender)),
          admissionDate: cleanENC(d(data.admissionDate)),
          status: cleanENC(d(data.status)),
          outcomeDate: cleanENC(d(data.outcomeDate)),
          mrn: cleanENC(d(data.mrn)),
          nik: cleanENC(d(data.nik)),
          birthDate: cleanENC(d(data.birthDate)),
          ageMonth: cleanENC(d(data.ageMonth)),
          ageDay: cleanENC(d(data.ageDay)),
          doctorIGD: cleanENC(d(data.doctorIGD)),
          doctorIntern: cleanENC(d(data.doctorIntern)),
          doctorDPJP: cleanENC(d(data.doctorDPJP)),
          diagnosisPrimary: cleanENC(d(data.diagnosisPrimary)),
          diagnosisSecondary: cleanENC(d(data.diagnosisSecondary)),
          entryStatus: cleanENC(d(data.entryStatus)),
          serviceType: cleanENC(d(data.serviceType)),
          followUp: cleanENC(d(data.followUp)),
          exitNote: cleanENC(d(data.exitNote)),
          classRoom: cleanENC(d(data.classRoom)),
          jknType: cleanENC(d(data.jknType)),
          doctorKonsul: cleanENC(d(data.doctorKonsul)),
          icd10Code: cleanENC(d(data.icd10Code)),
          tariff: cleanENC(d(data.tariff)),
          action: cleanENC(d(data.action)),
          hp: cleanENC(d(data.hp)),
          notes: cleanENC(d(data.notes)),
          specialization: cleanENC(d(data.specialization)),
          operationCategory: cleanENC(d(data.operationCategory)),
          operationStatus: cleanENC(d(data.operationStatus)),
          visitType: cleanENC(d(data.visitType)),
          followUpService: cleanENC(d(data.followUpService)),
          birthWeight: cleanENC(d(data.birthWeight)),
          nicuActionManual: cleanENC(d(data.nicuActionManual)),
          
          // Konversi nilai Boolean
          isDeadInIGD: d(data.isDeadInIGD) === 'true',
          isDOA: d(data.isDOA) === 'true',
          isInjury: d(data.isInjury) === 'true',
          isFalseEmergency: d(data.isFalseEmergency) === 'true',
          
          // Penanganan Aman JSON Parse
          nicuActions: (decNicuActions && !decNicuActions.startsWith('ENC:')) ? JSON.parse(decNicuActions || "[]") : [],
          
          // Metadata statistik (Prioritaskan versi RAW agar tetap terekap saat terkunci)
          statsRoom: data.room_raw || cleanENC(d(data.room)),
          statsPayment: data.paymentStatus_raw || cleanENC(d(data.paymentStatus)),
          statsFollowUp: data.followUp_raw || cleanENC(d(data.followUp)),
          statsStatus: data.status_raw || cleanENC(d(data.status)),
          statsAdmissionDate: data.admissionDate_raw || cleanENC(d(data.admissionDate))
        };

        // Jika gembok terkunci, sensor data identitas utama
        if (isPatientLocked) {
          return {
            ...res,
            name: maskIcon, 
            age: maskIcon.substring(0, 2), 
            address: maskIcon, 
            mrn: maskIcon, 
            nik: maskIcon,
            birthDate: maskIcon
          };
        }

        return res;
      });
      setPatients(decryptedData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });

    return () => { 
      unsubAuth(); unsubRooms(); unsubReports(); unsubPatients(); 
    };
  }, [user, patientMasterKey, isPatientLocked]);

  // --- C. KALKULASI MEMOIZED & FILTERING ---

  /**
   * Menghitung statistik per ruangan berdasarkan data pasien aktif
   */
  const calculatedStats = useMemo(() => {
    const stats = {};
    rooms.forEach(r => {
      const isPoli = r.name.includes('POLI');
      const isOK = r.name.includes('OK') || r.name.includes('BEDAH SENTRAL');
      
      const activePts = patients.filter(p => {
          // Selalu gunakan kolom 'stats' (RAW) agar rekap tidak hilang saat gembok terkunci
          const roomNameMatch = (p.statsRoom || p.room) === r.name;
          const pDate = p.statsAdmissionDate || p.admissionDate;
          
          if (isPoli || isOK) {
              // Poli dan OK reset harian berdasarkan tanggal masuk
              return roomNameMatch && pDate === report.date;
          } else {
              if (['IGD', 'IGD PONEK'].includes(r.name)) {
                  // IGD & PONEK hanya merekap yang DIOBSERVASI
                  const fup = p.statsFollowUp || p.followUp;
                  return roomNameMatch && fup === 'Observasi';
              }
              // Rawat Inap lainnya berdasarkan status aktif
              const st = p.statsStatus || p.status;
              return roomNameMatch && st === 'Dirawat /Inap';
          }
      });
      
      stats[r.pasienKey] = activePts.length;
      stats[r.bpjsKey] = activePts.filter(p => (p.statsPayment || p.paymentStatus) === 'BPJS').length;
      stats[r.umumKey] = activePts.filter(p => ['Umum', 'Keringanan (Cost Sharing)', 'GR'].includes(p.statsPayment || p.paymentStatus)).length;
    });

    return stats;
  }, [patients, rooms, report.date]);

  /**
   * Menggabungkan data report manual dengan hasil kalkulasi otomatis
   */
  const finalReport = useMemo(() => ({
    ...report, ...calculatedStats
  }), [report, calculatedStats]);

  /**
   * Ruangan yang ditampilkan berdasarkan hak akses login
   */
  const visibleRooms = useMemo(() => {
    if (isStaffLoggedIn && loggedInRoomId) return rooms.filter(r => r.id === loggedInRoomId);
    if (isAdmin && adminSelectedRoomId) return rooms.filter(r => r.id === adminSelectedRoomId);
    return rooms;
  }, [rooms, isStaffLoggedIn, loggedInRoomId, isAdmin, adminSelectedRoomId]);

  /**
   * Daftar pasien untuk ruangan yang sedang aktif (Login Ruangan)
   */
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

  /**
   * Hasil pencarian pasien global
   */
  const searchResults = useMemo(() => {
    let results = patients;
    if (isStaffLoggedIn && loggedInRoomId) {
      const myRoom = rooms.find(r => r.id === loggedInRoomId);
      if (myRoom) results = results.filter(p => p.room === myRoom.name);
    } else if (searchRoomFilter) {
      const roomName = rooms.find(r => r.id === searchRoomFilter)?.name;
      if (roomName) results = results.filter(p => p.room === roomName);
    }
    
    if (searchDate) {
        results = results.filter(p => p.admissionDate === searchDate);
    }

    if (searchTerm) {
      results = results.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return results;
  }, [patients, searchTerm, searchDate, searchRoomFilter, rooms, isStaffLoggedIn, loggedInRoomId]);

  /**
   * Filter data pasien untuk keperluan unduhan Excel
   */
  const filteredDownloadData = useMemo(() => {
    let data = patients;
    if (isStaffLoggedIn && loggedInRoomId) {
        const myRoom = rooms.find(r => r.id === loggedInRoomId);
        if (myRoom) data = data.filter(p => p.room === myRoom.name);
    } else if (isAdmin && downloadRoomFilter) {
        const selectedRoom = rooms.find(r => r.id === downloadRoomFilter);
        if (selectedRoom) data = data.filter(p => p.room === selectedRoom.name);
    }

    if (!data || data.length === 0) return [];
    
    const targetDate = new Date(downloadSettings.month);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    
    return data.filter(p => {
        if (!p.admissionDate) return false;
        const pDate = new Date(p.admissionDate);
        
        const sameMonth = pDate.getMonth() === targetMonth && pDate.getFullYear() === targetYear;
        if (!sameMonth) return false;

        if (downloadSettings.mode === 'mtd') {
            const today = new Date();
            return pDate <= today;
        }
        return true;
    });
  }, [patients, isStaffLoggedIn, loggedInRoomId, isAdmin, downloadRoomFilter, rooms, downloadSettings]);

  // --- D. ACTION HANDLERS (FUNGSI AKSI) ---

  // Ruangan & Pengaturan
  const handleUpdateRoomName = useCallback(async (roomId, newName) => {
    if (!user) {
      showToast("Tidak ada koneksi atau sesi habis.", "error");
      return;
    }
    if (!newName || !newName.trim()) {
      showToast("Nama ruangan tidak boleh kosong!", "error");
      return;
    }
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId), { name: newName.trim() }, { merge: true });
      showToast("Nama Ruangan Diperbarui");
    } catch (e) {
      showToast(`Gagal update: ${e.message}`, "error");
    }
  }, [user]);

  const handleAddRoom = async () => {
    if (!newRoomData.name || !newRoomData.id) return;
    const cid = newRoomData.id.toUpperCase().replace(/\s/g, '');
    const room = {
      id: cid, name: newRoomData.name, icon: 'Home', defaultTT: 20,
      ttKey: `${cid}TT`, pasienKey: `${cid}Pasien`, bpjsKey: `${cid}Bpjs`,
      umumKey: newRoomData.hasUmum ? `${cid}Umum` : null,
      cardGradient: 'bg-slate-200'
    };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', cid), room);
    saveRoomConfiguration(cid, newRoomData.name, cid.toLowerCase(), '123');
    setNewRoomData({ name: '', id: '', hasUmum: true });
    showToast("Ruangan ditambahkan");
  };

  const saveRoomConfiguration = async (roomId, newName, username, password) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId), { name: newName }, { merge: true });
      showToast("Nama ruangan tersimpan");
    } catch (e) {
      showToast("Gagal ubah nama: " + e.message, "error");
      return; 
    }
    try {
      const updatedAccess = { ...authSettings.roomAccess, [roomId]: { username, password } };
      const newSettings = { ...authSettings, roomAccess: updatedAccess };
      setAuthSettings(newSettings);
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'auth'), newSettings, { merge: true });
      showToast("Password tersimpan");
    } catch (e) {
      showToast("Nama tersimpan, TAPI Password gagal (Cek Izin)", "warning");
    }
  }

  // Auth Handlers
  const handleLogin = (e) => {
    e.preventDefault();
    const accessKey = authSettings.publicAccessCode || '123';

    // Login Admin
    if (loginUsername === authSettings.adminUsername && loginPassword === authSettings.adminPassword) {
      setIsAdmin(true); setIsPatientLocked(false); setPatientMasterKey(accessKey);
      setShowLoginModal(false); setActiveTab('dashboard'); showToast("Login Berhasil: Super Admin");
      return;
    }

    // Login Petugas Informasi
    if (loginUsername.toLowerCase() === 'informasi' && loginPassword === (authSettings.infoPassword || '123')) {
      setIsInfoLoggedIn(true); setIsPatientLocked(false); setPatientMasterKey(accessKey);
      setShowLoginModal(false); setActiveTab('search'); showToast("Login Berhasil: Petugas Informasi");
      return;
    }

    // Login Per Ruangan
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

  const updateCredentials = async (data) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'auth'), data);
    showToast("Password diperbarui");
  };

  // Handlers Data Pasien
  const handleOpenAddModal = () => {
    setEditingPatient(null);
    const targetRoomId = isStaffLoggedIn ? loggedInRoomId : (isAdmin ? adminSelectedRoomId : null);
    const currentRoom = rooms.find(r => r.id === targetRoomId);
    const roomName = currentRoom ? currentRoom.name : '';

    setPatientFormData({
      name: '', age: '', room: roomName, address: '', gender: 'Laki-Laki',
      paymentStatus: 'BPJS', admissionDate: report.date || new Date().toISOString().split('T')[0],
      status: 'Dirawat /Inap', outcomeDate: '', 
      mrn: '', nik: '', birthDate: '', ageMonth: '', ageDay: '',
      doctorIGD: '', doctorIntern: '', doctorDPJP: '',
      diagnosisPrimary: '', diagnosisSecondary: '',
      entryStatus: 'Non Rujukan', serviceType: 'Non Bedah Lainnya',
      followUp: 'Observasi', exitNote: '',
      isDeadInIGD: false, isDOA: false, isInjury: false, isFalseEmergency: false,
      classRoom: 'III', jknType: 'PBI (APBD)', doctorKonsul: '',
      tariff: '', icd10Code: '', action: '', hp: '', notes: '',
      specialization: '', operationCategory: '', operationStatus: '',
      visitType: 'Baru', specializationManual: '', followUpService: 'Dirawat',
      birthWeight: '', nicuActions: [], nicuActionManual: ''
    });
    setIsPatientModalOpen(true);
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
      setEditFormData(null);
    } catch (e) {
      showToast("Gagal simpan: " + e.message, "error");
    }
  };

  const handleConfirmAction = async () => {
    if (!user || isSaving) return;

    if (confirmModal.type === 'save_patient') {
      setIsSaving(true);
      
      // KOLOM RAW: Disimpan tanpa enkripsi untuk statistik dashboard
      const payload = {
        name: encrypt(patientFormData.name, patientMasterKey),
        age: encrypt(patientFormData.age, patientMasterKey),
        address: encrypt(patientFormData.address, patientMasterKey),
        room: encrypt(patientFormData.room, patientMasterKey),
        paymentStatus: encrypt(patientFormData.paymentStatus, patientMasterKey),
        gender: encrypt(patientFormData.gender, patientMasterKey),
        admissionDate: encrypt(patientFormData.admissionDate, patientMasterKey),
        status: encrypt(patientFormData.status, patientMasterKey),
        followUp: encrypt(patientFormData.followUp || '', patientMasterKey),
        
        // Metadata mentah untuk statistik dashboard (Penting untuk IGD PONEK Observasi)
        room_raw: patientFormData.room,
        followUp_raw: patientFormData.followUp,
        status_raw: patientFormData.status,
        paymentStatus_raw: patientFormData.paymentStatus,
        admissionDate_raw: patientFormData.admissionDate,

        outcomeDate: encrypt(patientFormData.outcomeDate || '', patientMasterKey),
        mrn: encrypt(patientFormData.mrn || '', patientMasterKey),
        nik: encrypt(patientFormData.nik || '', patientMasterKey),
        birthDate: encrypt(patientFormData.birthDate || '', patientMasterKey),
        ageMonth: encrypt(patientFormData.ageMonth || '', patientMasterKey),
        ageDay: encrypt(patientFormData.ageDay || '', patientMasterKey),
        doctorIGD: encrypt(patientFormData.doctorIGD || '', patientMasterKey),
        doctorIntern: encrypt(patientFormData.doctorIntern || '', patientMasterKey),
        doctorDPJP: encrypt(patientFormData.doctorDPJP || '', patientMasterKey),
        diagnosisPrimary: encrypt(patientFormData.diagnosisPrimary || '', patientMasterKey),
        diagnosisSecondary: encrypt(patientFormData.diagnosisSecondary || '', patientMasterKey),
        entryStatus: encrypt(patientFormData.entryStatus || '', patientMasterKey),
        serviceType: encrypt(patientFormData.serviceType || '', patientMasterKey),
        exitNote: encrypt(patientFormData.exitNote || '', patientMasterKey),
        isDeadInIGD: encrypt(String(patientFormData.isDeadInIGD || false), patientMasterKey),
        isDOA: encrypt(String(patientFormData.isDOA || false), patientMasterKey),
        isInjury: encrypt(String(patientFormData.isInjury || false), patientMasterKey),
        isFalseEmergency: encrypt(String(patientFormData.isFalseEmergency || false), patientMasterKey),
        classRoom: encrypt(patientFormData.classRoom || '', patientMasterKey),
        jknType: encrypt(patientFormData.jknType || '', patientMasterKey),
        doctorKonsul: encrypt(patientFormData.doctorKonsul || '', patientMasterKey),
        icd10Code: encrypt(patientFormData.icd10Code || '', patientMasterKey),
        tariff: encrypt(patientFormData.tariff || '', patientMasterKey),
        action: encrypt(patientFormData.action || '', patientMasterKey),
        hp: encrypt(patientFormData.hp || '', patientMasterKey),
        notes: encrypt(patientFormData.notes || '', patientMasterKey),
        specialization: encrypt(patientFormData.specialization === 'Spesialisasi Lain' ? patientFormData.specializationManual : patientFormData.specialization || '', patientMasterKey),
        operationCategory: encrypt(patientFormData.operationCategory || '', patientMasterKey),
        operationStatus: encrypt(patientFormData.operationStatus || '', patientMasterKey),
        visitType: encrypt(patientFormData.visitType || '', patientMasterKey),
        followUpService: encrypt(patientFormData.followUpService || '', patientMasterKey),
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
        birthWeight: encrypt(patientFormData.birthWeight || '', patientMasterKey),
        nicuActions: encrypt(JSON.stringify(patientFormData.nicuActions || []), patientMasterKey),
        nicuActionManual: encrypt(patientFormData.nicuActionManual || '', patientMasterKey)
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
        setPatientFormData({ 
            name: '', age: '', room: defaultRoomName, address: '', gender: 'Laki-Laki', paymentStatus: 'BPJS', admissionDate: report.date || new Date().toISOString().split('T')[0], status: 'Dirawat /Inap', outcomeDate: '', specialization: '', operationCategory: '', operationStatus: '',
            visitType: 'Baru', specializationManual: '', followUpService: 'Dirawat', birthWeight: '', nicuActions: [], nicuActionManual: '', followUp: 'Observasi'
        });
      } catch (e) {
        showToast("Gagal simpan: Error jaringan", "error");
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
        showToast("Gagal menghapus", "error");
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handlePatientSubmit = async (e) => {
    e.preventDefault();
    if (!user) { showToast("Anda harus login terlebih dahulu", "error"); return; }
    if (isPatientLocked) { showToast("Akses Terkunci! Masukkan kode gembok untuk menyimpan.", "error"); return; }

    if (!patientFormData.name || !patientFormData.age || !patientFormData.address || !patientFormData.admissionDate || !patientFormData.room) {
      showToast("Gagal simpan: Semua data wajib diisi!", "error");
      return;
    }

    if (!patientFormData.room.toUpperCase().includes('POLI') && patientFormData.room !== 'IGD' && patientFormData.room !== 'IGD PONEK' && patientFormData.status !== 'Dirawat /Inap' && !patientFormData.outcomeDate) {
      showToast("Gagal simpan: Tanggal keluar wajib diisi!", "error");
      return;
    }

    setConfirmModal({
      isOpen: true, 
      type: 'save_patient', 
      title: 'Konfirmasi Simpan',
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

  const toggleNicuAction = (val) => {
    setPatientFormData(prev => {
        const current = prev.nicuActions || [];
        const next = current.includes(val) ? current.filter(x => x !== val) : [...current, val];
        return { ...prev, nicuActions: next };
    });
  };

  /**
   * Fungsi Ekspor Laporan ke Excel (.xls)
   */
  const handleDownloadExcel = () => {
    const dateObj = new Date(downloadSettings.month);
    const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
    const currentMonth = monthNames[dateObj.getMonth()];
    const currentYear = dateObj.getFullYear();

    let roomNameDisplay = "ALL";
    if (isStaffLoggedIn && loggedInRoomId) {
      roomNameDisplay = rooms.find(r => r.id === loggedInRoomId)?.name.toUpperCase() || "RUANGAN";
    } else if (isAdmin && downloadRoomFilter) {
      roomNameDisplay = rooms.find(r => r.id === downloadRoomFilter)?.name.toUpperCase() || "RUANGAN";
    }

    const reportTypeLabel = downloadSettings.mode === 'mtd' ? 'REKAPAN AWAL BULAN S/D HARI INI (REAL TIME)' : 'REKAPAN SATU BULAN PENUH';

    let tableRows = "";
    let tableHeader = "";
    
    // Gaya Inline Excel
    const commonStyle = 'font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #000000; vertical-align: middle; border: .5pt solid #000000;';
    const borderStyle = `${commonStyle} padding: 4px; text-align: left;`;
    const centerStyle = `${commonStyle} padding: 4px; text-align: center;`;
    const textStyle = `mso-number-format:"\\@"; ${borderStyle}`;
    const thStyle = 'border: .5pt solid #000000; background-color: #e0e0e0; font-weight: bold; text-align: center; padding: 10px; font-size: 12pt; font-family: Calibri, Arial, sans-serif; color: #000000; vertical-align: middle;';
    const metaLabelStyle = 'padding: 4px; font-family: Calibri, Arial, sans-serif; font-size: 12pt; font-weight: bold; color: #000000; border: none; text-align: left;';
    const metaValueStyle = 'padding: 4px; font-family: Calibri, Arial, sans-serif; font-size: 12pt; font-weight: bold; color: #000000; border: none; text-align: left;';

    const isIGD = roomNameDisplay.includes('IGD');
    const isOK = roomNameDisplay.includes('OK') || roomNameDisplay.includes('BEDAH SENTRAL');
    const isPoli = roomNameDisplay.includes('POLI');
    const isNICU = roomNameDisplay === 'NICU' || roomNameDisplay.includes('NICU');
    const isInpatient = !isIGD && !isOK && !isPoli;

    const dataToExport = filteredDownloadData;

    // Logika Header & Row berdasarkan jenis ruangan
    if (isNICU) {
        tableHeader = `<tr><th style="${thStyle}">No</th><th style="${thStyle}">Nama Ruangan</th><th style="${thStyle}">Nomor RM</th><th style="${thStyle}">Nama Pasien</th><th style="${thStyle}">Jenis Kelamin</th><th style="${thStyle}">Tgl Lahir</th><th style="${thStyle}">Usia</th><th style="${thStyle}">Berat Badan (gr)</th><th style="${thStyle}">Alamat</th><th style="${thStyle}">Tgl Masuk</th><th style="${thStyle}">Tgl Keluar</th><th style="${thStyle}">DPJP</th><th style="${thStyle}">Diagnosa Utama</th><th style="${thStyle}">Pemberian HB 0</th><th style="${thStyle}">Pemberian Hb Ig</th><th style="${thStyle}">Pemeriksaan SHK</th><th style="${thStyle}">Tindakan Lainnya</th><th style="${thStyle}">Pembayaran</th><th style="${thStyle}">Status</th></tr>`;
        dataToExport.forEach((p, index) => {
            const admissionDate = p.admissionDate ? formatDateID(p.admissionDate) : '';
            const outcomeDate = p.outcomeDate ? formatDateID(p.outcomeDate) : '';
            const birthDate = p.birthDate ? formatDateID(p.birthDate) : '';
            
            const actions = p.nicuActions || [];
            const vHB0 = actions.includes('Pemberian HB 0') ? 'V' : '';
            const vHBIg = actions.includes('Pemberian Hb Ig') ? 'V' : '';
            const vSHK = actions.includes('Pemeriksaan SHK') ? 'V' : '';
            const vOther = actions.includes('Tindakan Lainnya') ? (p.nicuActionManual ? `V (${p.nicuActionManual})` : 'V') : '';
            
            const ageDisplay = `${p.age || 0}th ${p.ageMonth || 0}bln ${p.ageDay || 0}hr`;
            
            tableRows += `<tr><td style="${centerStyle}">${index + 1}</td><td style="${borderStyle}">${p.room}</td><td style="${textStyle}">${p.mrn || ''}</td><td style="${borderStyle}">${p.name}</td><td style="${borderStyle}">${p.gender}</td><td style="${centerStyle}">${birthDate}</td><td style="${centerStyle}">${ageDisplay}</td><td style="${centerStyle}">${p.birthWeight || '-'}</td><td style="${borderStyle}">${p.address}</td><td style="${centerStyle}">${admissionDate}</td><td style="${centerStyle}">${outcomeDate}</td><td style="${borderStyle}">${p.doctorDPJP || ''}</td><td style="${borderStyle}">${p.diagnosisPrimary || ''}</td><td style="${centerStyle}">${vHB0}</td><td style="${centerStyle}">${vHBIg}</td><td style="${centerStyle}">${vSHK}</td><td style="${borderStyle}">${vOther}</td><td style="${centerStyle}">${p.paymentStatus}</td><td style="${centerStyle}">${p.status}</td></tr>`;
        });
    } else if (isIGD) {
        tableHeader = `<tr><th style="${thStyle}">No</th><th style="${thStyle}">Tanggal Masuk UGD</th><th style="${thStyle}">Nomor RM</th><th style="${thStyle}">Nama Pasien</th><th style="${thStyle}">Jenis Kelamin</th><th style="${thStyle}">NIK / No BPJS</th><th style="${thStyle}">Tanggal Lahir</th><th style="${thStyle}">Umur (Tahun)</th><th style="${thStyle}">Umur (Bulan)</th><th style="${thStyle}">Umur (Hari)</th><th style="${thStyle}">Alamat</th><th style="${thStyle}">Dokter UGD</th><th style="${thStyle}">Dokter Internsip</th><th style="${thStyle}">Dokter DPJP</th><th style="${thStyle}">Diagnosa Utama</th><th style="${thStyle}">Diagnosa Sekunder</th><th style="${thStyle}">JKN / BPJS</th><th style="${thStyle}">UMUM</th><th style="${thStyle}">Keringanan (Cost Sharing)</th><th style="${thStyle}">Keterangan Masuk</th><th style="${thStyle}">Jenis Pelayanan</th><th style="${thStyle}">Tindak Lanjut Pelayanan</th><th style="${thStyle}">Catatan Keterangan Keluar</th><th style="${thStyle}">Mati di IGD</th><th style="${thStyle}">DOA (Death On Arrive)</th><th style="${thStyle}">Luka-Luka</th><th style="${thStyle}">False Emergency</th></tr>`;
        dataToExport.forEach((p, index) => {
            const admissionDate = p.admissionDate ? formatDateID(p.admissionDate) : '';
            const birthDate = p.birthDate ? formatDateID(p.birthDate) : '';
            tableRows += `<tr><td style="${centerStyle}">${index + 1}</td><td style="${centerStyle}">${admissionDate}</td><td style="${textStyle}">${p.mrn || ''}</td><td style="${borderStyle}">${p.name || ''}</td><td style="${borderStyle}">${p.gender || ''}</td><td style="${textStyle}">${p.nik || ''}</td><td style="${centerStyle}">${birthDate}</td><td style="${centerStyle}">${p.age ? p.age + ' th' : ''}</td><td style="${centerStyle}">${p.ageMonth ? p.ageMonth + ' bln' : ''}</td><td style="${centerStyle}">${p.ageDay ? p.ageDay + ' hr' : ''}</td><td style="${borderStyle}">${p.address || ''}</td><td style="${borderStyle}">${p.doctorIGD || ''}</td><td style="${borderStyle}">${p.doctorIntern || ''}</td><td style="${borderStyle}">${p.doctorDPJP || ''}</td><td style="${borderStyle}">${p.diagnosisPrimary || ''}</td><td style="${borderStyle}">${p.diagnosisSecondary || ''}</td><td style="${centerStyle}">${p.paymentStatus === 'BPJS' ? 'V' : ''}</td><td style="${centerStyle}">${['Umum', 'Keringanan (Cost Sharing)'].includes(p.paymentStatus) ? 'V' : ''}</td><td style="${centerStyle}">${p.paymentStatus === 'Keringanan (Cost Sharing)' ? 'V' : ''}</td><td style="${borderStyle}">${p.entryStatus || ''}</td><td style="${borderStyle}">${p.serviceType || ''}</td><td style="${borderStyle}">${p.followUp || ''}</td><td style="${borderStyle}">${p.exitNote || ''}</td><td style="${centerStyle}">${p.isDeadInIGD ? 'V' : ''}</td><td style="${centerStyle}">${p.isDOA ? 'V' : ''}</td><td style="${centerStyle}">${p.isInjury ? 'V' : ''}</td><td style="${centerStyle}">${p.isFalseEmergency ? 'V' : ''}</td></tr>`;
        });
    } else if (isPoli) {
        tableHeader = `<tr><th style="${thStyle}">No</th><th style="${thStyle}">Nama Poliklinik</th><th style="${thStyle}">Tanggal Kunjungan</th><th style="${thStyle}">Nomor RM</th><th style="${thStyle}">Nama Pasien</th><th style="${thStyle}">Jenis Kelamin</th><th style="${thStyle}">Tanggal Lahir</th><th style="${thStyle}">Umur (Lengkap)</th><th style="${thStyle}">Alamat</th><th style="${thStyle}">Jenis Kunjungan</th><th style="${thStyle}">Pembayaran</th><th style="${thStyle}">DPJP</th><th style="${thStyle}">Diagnosa Utama</th><th style="${thStyle}">Kode ICD X</th><th style="${thStyle}">Diagnosa Sekunder</th><th style="${thStyle}">Spesialisasi</th><th style="${thStyle}">Keterangan Masuk</th><th style="${thStyle}">Tindak Lanjut</th></tr>`;
        dataToExport.forEach((p, index) => {
            const admissionDate = p.admissionDate ? formatDateID(p.admissionDate) : '';
            const birthDate = p.birthDate ? formatDateID(p.birthDate) : '';
            const ageComplete = `${p.age || 0}th ${p.ageMonth || 0}bln ${p.ageDay || 0}hr`;
            tableRows += `<tr><td style="${centerStyle}">${index + 1}</td><td style="${borderStyle}">${p.room}</td><td style="${centerStyle}">${admissionDate}</td><td style="${textStyle}">${p.mrn || ''}</td><td style="${borderStyle}">${p.name}</td><td style="${borderStyle}">${p.gender}</td><td style="${centerStyle}">${birthDate}</td><td style="${centerStyle}">${ageComplete}</td><td style="${borderStyle}">${p.address}</td><td style="${centerStyle}">${p.visitType || '-'}</td><td style="${centerStyle}">${p.paymentStatus}</td><td style="${borderStyle}">${p.doctorDPJP || ''}</td><td style="${borderStyle}">${p.diagnosisPrimary || ''}</td><td style="${centerStyle}">${p.icd10Code || ''}</td><td style="${borderStyle}">${p.diagnosisSecondary || ''}</td><td style="${borderStyle}">${p.specialization || ''}</td><td style="${borderStyle}">${p.entryStatus || ''}</td><td style="${borderStyle}">${p.followUpService || ''}</td></tr>`;
        });
    } else if (isOK) {
        tableHeader = `<tr><th style="${thStyle}">No</th><th style="${thStyle}">Nomor RM</th><th style="${thStyle}">Nama Pasien</th><th style="${thStyle}">Nomor NIK / BPJS</th><th style="${thStyle}">Jenis Pembayaran</th><th style="${thStyle}">Jenis Kepesertaan JKN</th><th style="${thStyle}">Jenis Kelamin</th><th style="${thStyle}">Tanggal Lahir</th><th style="${thStyle}">Umur (Tahun)</th><th style="${thStyle}">Umur (Bulan)</th><th style="${thStyle}">Umur (Hari)</th><th style="${thStyle}">Alamat</th><th style="${thStyle}">Tanggal Operasi</th><th style="${thStyle}">Dokter DPJP</th><th style="${thStyle}">Spesialisasi</th><th style="${thStyle}">Jenis Operasi</th><th style="${thStyle}">Tindakan Operasi</th><th style="${thStyle}">Diagnosa Utama</th><th style="${thStyle}">Tindakan</th><th style="${thStyle}">Keterangan</th></tr>`;
        dataToExport.forEach((p, index) => {
            const admissionDate = p.admissionDate ? formatDateID(p.admissionDate) : ''; 
            const birthDate = p.birthDate ? formatDateID(p.birthDate) : '';
            let jenisBayarFull = p.paymentStatus;
            if (p.paymentStatus === 'BPJS' && p.classRoom) jenisBayarFull += ` Kelas ${p.classRoom}`;
            tableRows += `<tr><td style="${centerStyle}">${index + 1}</td><td style="${textStyle}">${p.mrn || ''}</td><td style="${borderStyle}">${p.name}</td><td style="${textStyle}">${p.nik || ''}</td><td style="${borderStyle}">${jenisBayarFull}</td><td style="${borderStyle}">${p.jknType || ''}</td><td style="${borderStyle}">${p.gender}</td><td style="${centerStyle}">${birthDate}</td><td style="${centerStyle}">${p.age} tahun</td><td style="${centerStyle}">${p.ageMonth || 0} Bulan</td><td style="${centerStyle}">${p.ageDay || 0} Hari</td><td style="${borderStyle}">${p.address}</td><td style="${centerStyle}">${admissionDate}</td><td style="${borderStyle}">${p.doctorDPJP || ''}</td><td style="${borderStyle}">${p.specialization || ''}</td><td style="${borderStyle}">${p.operationCategory || ''}</td><td style="${borderStyle}">${p.operationStatus || ''}</td><td style="${borderStyle}">${p.diagnosisPrimary || ''}</td><td style="${borderStyle}">${p.action || ''}</td><td style="${borderStyle}">${p.notes || ''}</td></tr>`;
        });
    } else if (isInpatient) {
        tableHeader = `<tr><th style="${thStyle}">No</th><th style="${thStyle}">Nama Ruangan</th><th style="${thStyle}">Nomor RM</th><th style="${thStyle}">Nama Pasien</th><th style="${thStyle}">Nomor NIK / BPJS</th><th style="${thStyle}">Jenis Kepesertaan JKN</th><th style="${thStyle}">Jenis Kelamin</th><th style="${thStyle}">Tanggal Lahir</th><th style="${thStyle}">Umur (Tahun)</th><th style="${thStyle}">Umur (Bulan)</th><th style="${thStyle}">Umur (Hari)</th><th style="${thStyle}">Alamat</th><th style="${thStyle}">Tanggal Masuk</th><th style="${thStyle}">Tanggal Keluar</th><th style="${thStyle}">Lama Di Rawat (Hari)</th><th style="${thStyle}">Dokter DPJP</th><th style="${thStyle}">Tarif</th><th style="${thStyle}">Dokter Konsul</th><th style="${thStyle}">Diagnosa Utama</th><th style="${thStyle}">Kode ICD 10</th><th style="${thStyle}">Diagnosa Sekunder</th><th style="${thStyle}">Tindakan</th><th style="${thStyle}">JKN / BPJS</th><th style="${thStyle}">UMUM</th><th style="${thStyle}">Keringanan (Cost Sharing)</th><th style="${thStyle}">Kelas</th><th style="${thStyle}">HP (Hari Perawatan)</th><th style="${thStyle}">Keterangan Keluar</th><th style="${thStyle}">Keterangan</th></tr>`;
        dataToExport.forEach((p, index) => {
            const admissionDate = p.admissionDate ? formatDateID(p.admissionDate) : '';
            const outcomeDate = p.outcomeDate ? formatDateID(p.outcomeDate) : '';
            const birthDate = p.birthDate ? formatDateID(p.birthDate) : '';
            let los = '';
            if (p.admissionDate && p.outcomeDate) {
               const diff = Math.abs(new Date(p.outcomeDate) - new Date(p.admissionDate));
               los = Math.ceil(diff / (1000 * 60 * 60 * 24)) || 1;
            }
            tableRows += `<tr><td style="${centerStyle}">${index + 1}</td><td style="${borderStyle}">${p.room}</td><td style="${textStyle}">${p.mrn || ''}</td><td style="${borderStyle}">${p.name}</td><td style="${textStyle}">${p.nik || ''}</td><td style="${borderStyle}">${p.jknType || ''}</td><td style="${borderStyle}">${p.gender}</td><td style="${centerStyle}">${birthDate}</td><td style="${centerStyle}">${p.age}</td><td style="${centerStyle}">${p.ageMonth || ''}</td><td style="${centerStyle}">${p.ageDay || ''}</td><td style="${borderStyle}">${p.address}</td><td style="${centerStyle}">${admissionDate}</td><td style="${centerStyle}">${outcomeDate}</td><td style="${centerStyle}">${los}</td><td style="${borderStyle}">${p.doctorDPJP || ''}</td><td style="${borderStyle}">${p.tariff || ''}</td><td style="${borderStyle}">${p.diagnosisPrimary || ''}</td><td style="${centerStyle}">${p.icd10Code || ''}</td><td style="${borderStyle}">${p.action || ''}</td><td style="${centerStyle}">${p.paymentStatus === 'BPJS' ? 'V' : ''}</td><td style="${centerStyle}">${['Umum', 'Keringanan (Cost Sharing)'].includes(p.paymentStatus) ? 'V' : ''}</td><td style="${centerStyle}">${p.paymentStatus === 'Keringanan (Cost Sharing)' ? 'V' : ''}</td><td style="${centerStyle}">${p.classRoom || ''}</td><td style="${centerStyle}">${p.hp || ''}</td><td style="${borderStyle}">${p.status}</td><td style="${borderStyle}">${p.notes || ''}</td></tr>`;
        });
    }

    const htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><!--[if gte gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Laporan ${currentMonth}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <style>body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #000000; } table { border-collapse: collapse; width: 100%; mso-displayed-decimal-separator:"\,"; mso-displayed-thousand-separator:"\."; } td, th { border: .5pt solid #000000; } br { mso-data-placement:same-cell; }</style></head>
      <body>
        <table>
            <tr><td colspan="2" style="${metaLabelStyle}">Ruangan :</td><td colspan="5" style="${metaValueStyle}">${roomNameDisplay}</td></tr>
            <tr><td colspan="2" style="${metaLabelStyle}">Bulan :</td><td colspan="5" style="${metaValueStyle}">${currentMonth}</td></tr>
            <tr><td colspan="2" style="${metaLabelStyle}">Tahun :</td><td colspan="5" style="${metaValueStyle}">${currentYear}</td></tr>
            <tr><td colspan="2" style="${metaLabelStyle}">Jenis Laporan :</td><td colspan="5" style="${metaValueStyle}">${reportTypeLabel}</td></tr>
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
    link.setAttribute("download", `Laporan_${roomNameDisplay.replace(/\s+/g, '_')}_${currentMonth}_${currentYear}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- E. FUNGSI RENDER SUB-HALAMAN ---

  /**
   * Menentukan Navigasi yang tersedia berdasarkan login
   */
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, activeIconBg: 'bg-indigo-500' }
  ];
  
  if (isStaffLoggedIn || isAdmin) { 
    navItems.push({ id: 'input', label: 'Input Data', icon: LayoutDashboard, activeIconBg: 'bg-blue-500' }); 
  }
  
  if ((!isStaffLoggedIn && !isAdmin)) { 
    navItems.push({ id: 'search', label: 'Cari Pasien', icon: Search, activeIconBg: 'bg-pink-500' }); 
  }
  
  if (isStaffLoggedIn || isAdmin) { 
    navItems.push({ id: 'download', label: 'Laporan', icon: FileSpreadsheet, activeIconBg: 'bg-emerald-600' }); 
  }
  
  if (isAdmin) {
    navItems.push({ id: 'history', label: 'Arsip Data', icon: ClipboardList, activeIconBg: 'bg-emerald-500' });
    navItems.push({ id: 'settings', label: 'Setting', icon: Settings, activeIconBg: 'bg-sky-500' });
  }

  /**
   * Render Halaman Pencarian
   */
  const renderSearch = () => (
    <div className="space-y-8 animate-in fade-in duration-500">
      <GlassContainer className="rounded-[2.5rem] p-8 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Search size={16} /> Pencarian Pasien
          </h2>
          {isPatientLocked ? (
            <button 
              onClick={() => setIsUnlockModalOpen(true)} 
              className="text-[10px] bg-rose-50 text-rose-600 px-4 py-1.5 rounded-full font-bold shadow-sm hover:bg-rose-100 transition-colors"
            >
              Buka Nama
            </button>
          ) : (
            <span className="text-[10px] bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full font-bold shadow-sm">
              Terbuka
            </span>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {!isStaffLoggedIn && (
            <div className="relative">
              <select 
                className="w-full bg-white/50 p-4 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100/50 transition-all appearance-none cursor-pointer text-xs uppercase border border-slate-100" 
                value={searchRoomFilter} 
                onChange={(e) => setSearchRoomFilter(e.target.value)}
              >
                <option value="">-- SEMUA RUANGAN --</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" size={16} />
            </div>
          )}
          
          <div className="relative">
            <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="date" 
              className="w-full bg-white/50 p-4 pl-12 rounded-2xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100/50 transition-all text-xs border border-slate-100" 
              value={searchDate} 
              onChange={e => setSearchDate(e.target.value)} 
            />
          </div>

          <div className={`relative ${!isStaffLoggedIn ? 'md:col-span-2' : 'md:col-span-3'}`}>
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
                      <th className="p-4">No</th>
                      <th className="p-4">Ruangan</th>
                      <th className="p-4">Nama</th>
                      <th className="p-4">JK</th>
                      <th className="p-4">Usia</th>
                      <th className="p-4">Alamat</th>
                      <th className="p-4">Tgl Masuk</th>
                      <th className="p-4">Tgl Keluar</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Keterangan</th>
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
                          {p.room === 'NICU' && p.birthWeight && <span className="block text-[9px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded w-fit mt-1">{p.birthWeight} gram</span>}
                        </td>
                        <td className="p-4 border-r border-slate-100 text-center">{p.gender === 'Laki-Laki' ? 'L' : 'P'}</td>
                        <td className="p-4 text-center border-r border-slate-100">{p.age} Th</td>
                        <td className="p-4 border-r border-slate-100 max-w-[150px] truncate" title={p.address}>{p.address || '-'}</td>
                        <td className="p-4 border-r border-slate-100 whitespace-nowrap">{formatDateID(p.admissionDate)}</td>
                        <td className="p-4 border-r border-slate-100 whitespace-nowrap">{p.outcomeDate ? formatDateID(p.outcomeDate) : '-'}</td>
                        <td className="p-4 border-r border-slate-100 text-center">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${p.paymentStatus === 'BPJS' ? 'bg-sky-100 text-sky-700' : p.paymentStatus === 'Keringanan (Cost Sharing)' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                            {p.paymentStatus}
                          </span>
                        </td>
                        <td className="p-4 border-r border-slate-100">
                          {p.room.toUpperCase().includes('POLI') ? (
                            <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap bg-orange-100 text-orange-700">{p.followUpService || '-'}</span>
                          ) : ['IGD', 'IGD PONEK'].includes(p.room) ? (
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${['Pindah Ruangan', 'Observasi'].includes(p.followUp) ? 'bg-emerald-100 text-emerald-700' : p.followUp === 'Meninggal di IGD' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                              {p.followUp === 'Pindah Ruangan' ? `Pindah (${p.exitNote || '-'})` : p.followUp}
                            </span>
                          ) : (
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${p.status === 'Dirawat /Inap' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                              {p.status === 'Pindah Ruangan' ? `Pindah (${p.notes || '-'})` : p.status}
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
                {(searchTerm || searchDate) ? "Tidak ada pasien yang sesuai kriteria" : "Belum ada data pasien"}
              </p>
            </div>
          )}
        </div>
      </GlassContainer>
    </div>
  );

  /**
   * Render Halaman Dashboard (Statistik)
   */
  const renderDashboard = () => {
    const poliRooms = rooms.filter(r => r.name.includes('POLI'));
    const excludeForBOR = ['IGD', 'IGD PONEK', 'OK (BEDAH SENTRAL)', 'UNIT DIALISIS'];
    const borRooms = rooms.filter(r => 
        !r.name.includes('POLI') && 
        !excludeForBOR.includes(r.name)
    );

    const totalInpatient = borRooms.reduce((acc, r) => acc + Number(finalReport[r.pasienKey] || 0), 0);
    const totalTT = borRooms.reduce((acc, r) => acc + Number(finalReport[r.ttKey] || r.defaultTT || 0), 0);
    const totalBor = totalTT > 0 ? (totalInpatient / totalTT) * 100 : 0;
    const totalPoli = poliRooms.reduce((acc, r) => acc + Number(finalReport[r.pasienKey] || 0), 0);

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-gradient-to-br from-blue-600 to-cyan-500 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-500/20 relative overflow-hidden border border-white/10 group">
                <div className="absolute -right-4 -bottom-4 p-4 opacity-20 group-hover:scale-110 transition-transform duration-700">
                  <Bed size={160} />
                </div>
                <h2 className="text-xs font-black text-white/60 uppercase mb-4 tracking-widest flex justify-between items-center">
                  <span>Pasien Rawat Inap</span>
                  <span className="text-white/80 bg-white/20 px-3 py-1 rounded-full">{formatDateID(report.date)}</span>
                </h2>
                <div className="flex items-end space-x-3">
                  <span className="text-7xl font-black tracking-tighter">{totalInpatient}</span>
                  <span className="text-xl font-bold opacity-70 mb-3">Pasien</span>
                </div>
                <div className="mt-8 bg-black/20 rounded-full h-3 w-full overflow-hidden backdrop-blur-sm">
                  <div className="bg-white h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(totalBor, 100)}%` }}></div>
                </div>
                <div className="flex justify-between mt-3 text-[10px] font-bold text-white/70 uppercase tracking-widest">
                  <span>BOR RAWAT INAP</span>
                  <span>{totalBor.toFixed(1)}%</span>
                </div>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-teal-400 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-emerald-500/20 relative overflow-hidden border border-white/10 group">
                <div className="absolute -right-6 -bottom-6 p-4 opacity-20 group-hover:scale-110 transition-transform duration-700">
                  <Stethoscope size={180} />
                </div>
                <h2 className="text-xs font-black text-white/60 uppercase mb-4 tracking-widest flex justify-between items-center">
                  <span>Kunjungan Poliklinik</span>
                  <span className="text-white/80 bg-white/20 px-3 py-1 rounded-full">{formatDateID(report.date)}</span>
                </h2>
                <div className="flex items-end space-x-3">
                  <span className="text-7xl font-black tracking-tighter">{totalPoli}</span>
                  <span className="text-xl font-bold opacity-70 mb-3">Pasien</span>
                </div>
                <div className="mt-8 bg-white/10 rounded-xl p-3 backdrop-blur-sm border border-white/10">
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-white/80">
                    <span>Total Poli Buka</span>
                    <span>{poliRooms.length} Poli</span>
                  </div>
                </div>
            </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-24">
          {rooms.map(r => {
            const filled = Number(finalReport[r.pasienKey] || 0) > 0;
            const isPoli = r.name.includes('POLI');
            const pct = isPoli ? 100 : Number(finalReport[r.pasienKey] || 0) / Number(finalReport[r.ttKey] || r.defaultTT || 1) * 100;
            return (
              <GlassContainer key={r.id} className="rounded-[2rem] p-5 flex flex-col justify-between hover:bg-white/80 transition-all cursor-default min-h-[140px]">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs text-white shadow-lg ${filled ? (r.cardGradient || 'bg-blue-500') : 'bg-slate-200'}`}>
                      {filled ? (isPoli ? 'ON' : `${pct.toFixed(0)}%`) : (isPoli ? 'OFF' : '0%')}
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-slate-700 tracking-wide block">{r.name}</span>
                      <span className={`text-[9px] font-black ${filled ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {filled ? (isPoli ? 'ADA KUNJUNGAN' : (['IGD', 'IGD PONEK'].includes(r.name) ? 'OBSERVASI' : 'TERISI')) : 'KOSONG'}
                      </span>
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
                      <span className="text-emerald-600 text-sm font-black">{Number(finalReport[r.bpjsKey] || 0)}</span>
                    </div>
                    <div className="w-px h-6 bg-slate-200"></div>
                    <div className="flex flex-col items-center">
                      <span className="text-[8px] uppercase tracking-wider opacity-70">UMUM</span>
                      <span className="text-amber-600 text-sm font-black">{Number(finalReport[r.umumKey] || 0)}</span>
                    </div>
                  </div>
                  {!isPoli && (
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full">
                      <div 
                        className={`${filled ? 'bg-indigo-500' : 'bg-slate-300'} h-full transition-all duration-1000`} 
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              </GlassContainer>
            );
          })}
        </div>
      </div>
    );
  };

  // --- F. RENDER JSX UTAMA ---

  return (
    <>
      <style>{animationStyles}</style>
      <div className="flex h-screen w-full simas-animated-bg font-sans flex-col md:flex-row overflow-hidden text-slate-800 selection:bg-indigo-500 selection:text-white">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        
        {/* MODAL KONFIRMASI */}
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[6000] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6">
            <GlassContainer className="w-full max-w-sm rounded-[2.5rem] p-10 text-center !bg-white">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ${confirmModal.type === 'save_patient' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
                <AlertTriangle size={40} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter mb-2">{confirmModal.title || 'Konfirmasi'}</h3>
              <p className="text-sm text-slate-700 font-extrabold mb-8 leading-relaxed px-4">{confirmModal.message}</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => !isSaving && setConfirmModal({ isOpen: false })} 
                  disabled={isSaving} 
                  className="flex-1 p-4 bg-slate-50 rounded-2xl font-black uppercase text-[10px] text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleConfirmAction} 
                  disabled={isSaving} 
                  className={`flex-1 p-4 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg transition-all ${confirmModal.type === 'save_patient' ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-rose-500 shadow-rose-500/30'}`}
                >
                  {isSaving ? 'Memproses...' : 'Ya, Lanjut'}
                </button>
              </div>
            </GlassContainer>
          </div>
        )}

        {/* MODAL EDIT ARSIP */}
        {editingId && editFormData && (
            <div className="fixed inset-0 z-[6500] bg-slate-900/80 backdrop-blur-lg flex items-center justify-center p-6 overflow-y-auto">
                <GlassContainer className="w-full max-w-4xl rounded-[3rem] p-10 bg-white relative">
                    <button onClick={() => {setEditingId(null); setEditFormData(null);}} className="absolute top-8 right-8 p-2 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-full transition-colors">
                      <X />
                    </button>
                    <div className="flex items-center gap-4 mb-10">
                        <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
                          <Edit3 size={28} />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black uppercase tracking-tighter">Edit Arsip Laporan</h3>
                          <p className="text-xs font-bold text-slate-400">Periode: {formatDateID(editFormData.date)}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[60vh] overflow-y-auto pr-4 scrollbar-hide">
                        {rooms.map(r => (
                            <div key={r.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                <h5 className="text-[10px] font-black uppercase text-indigo-600 mb-4 tracking-widest">{r.name}</h5>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <span className="text-[8px] font-black text-slate-400 uppercase">Kapasitas (TT)</span>
                                        <input type="number" className="w-full p-3 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500" value={editFormData[r.ttKey] || r.defaultTT} onChange={e => setEditFormData({...editFormData, [r.ttKey]: parseInt(e.target.value) || 0})} />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[8px] font-black text-slate-400 uppercase">Total Pasien</span>
                                        <input type="number" className="w-full p-3 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500" value={editFormData[r.pasienKey] || 0} onChange={e => setEditFormData({...editFormData, [r.pasienKey]: parseInt(e.target.value) || 0})} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-10 flex justify-end gap-4 border-t border-slate-100 pt-8">
                        <button onClick={() => {setEditingId(null); setEditFormData(null);}} className="px-8 py-4 bg-slate-100 rounded-2xl text-[10px] font-black uppercase text-slate-400 hover:bg-slate-200 transition-colors">Batal</button>
                        <button onClick={async () => {
                            try {
                                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reports', editingId), {...editFormData, updatedAt: Date.now()});
                                showToast("Arsip Berhasil Diperbarui");
                                setEditingId(null);
                                setEditFormData(null);
                            } catch (e) {
                                showToast("Gagal update arsip", "error");
                            }
                        }} className="px-10 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl shadow-indigo-600/30 hover:scale-105 active:scale-95 transition-all">
                          Simpan Perubahan
                        </button>
                    </div>
                </GlassContainer>
            </div>
        )}

        {/* MODAL UNLOCK DATA PASIEN */}
        {isUnlockModalOpen && (
          <div className="fixed inset-0 z-[6000] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
            <GlassContainer className="w-full max-w-sm rounded-[2.5rem] p-10 text-center !bg-white">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mx-auto mb-6 shadow-inner">
                <KeyRound size={40} />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter mb-2">Akses Data Pasien</h3>
              <p className="text-xs text-slate-400 font-bold mb-6 leading-relaxed px-4">Masukkan kunci akses untuk membuka sensor nama.</p>
              <input 
                type="password" 
                placeholder="Kunci Akses" 
                className="w-full bg-slate-50 rounded-2xl py-3 px-4 font-bold text-center text-slate-700 outline-none border border-transparent focus:border-indigo-500 focus:bg-white transition-all mb-4" 
                value={unlockKeyInput} 
                onChange={e => setUnlockKeyInput(e.target.value)} 
                autoFocus 
                onKeyDown={(e) => { if (e.key === 'Enter') handleUnlockAkses(); }} 
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsUnlockModalOpen(false)} 
                  className="flex-1 p-4 bg-slate-50 rounded-2xl font-black uppercase text-[10px] text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleUnlockAkses} 
                  className="flex-1 p-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all hover:scale-105"
                >
                  Buka
                </button>
              </div>
            </GlassContainer>
          </div>
        )}

        {/* MODAL LOGIN */}
        {showLoginModal && (
          <div className="fixed inset-0 z-[6000] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 animate-in zoom-in-95 duration-300">
            <GlassContainer className="w-full max-w-sm rounded-[3rem] p-10 shadow-2xl relative text-center !bg-white">
              <button 
                onClick={() => { setShowLoginModal(false); setLoginUsername(''); setLoginPassword(''); }} 
                className="absolute top-8 right-8 text-slate-300 hover:text-slate-500 transition-colors"
              >
                <X />
              </button>
              <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center text-indigo-600 mb-6 shadow-inner">
                  <KeyRound size={40} />
                </div>
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
                <button 
                  type="submit" 
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl shadow-indigo-600/30 mt-4 active:scale-95 transition-all hover:bg-indigo-700"
                >
                  Masuk Sistem
                </button>
              </form>
            </GlassContainer>
          </div>
        )}

        {/* SIDEBAR DESKTOP */}
        <aside className="hidden md:flex w-72 flex-col m-0 h-screen backdrop-blur-xl border-r border-white/30 shadow-2xl z-50 fixed left-0 top-0 bottom-0 glass-sidebar">
          <div className="p-8 pb-6 shrink-0">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-600/20">
                <Activity size={28} />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tighter uppercase leading-none">SIPAS</h1>
                <span className="text-xs font-bold text-indigo-600 tracking-widest">RSUD LEBONG</span>
              </div>
            </div>
            
            {/* Status Login di Sidebar */}
            {isStaffLoggedIn && loggedInRoomId && (
              <div className="mt-6 p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 flex flex-col gap-2 animate-in fade-in">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Login Sebagai</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-black text-indigo-700">
                    {rooms.find(r => r.id === loggedInRoomId)?.name}
                  </span>
                  <button onClick={handleLogout} className="p-1.5 bg-white text-rose-500 rounded-lg shadow-sm hover:bg-rose-50 transition-colors">
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            )}
            
            {isAdmin && (
              <div className="mt-6 p-4 bg-indigo-700 rounded-2xl border border-indigo-600 flex flex-col gap-2 animate-in fade-in shadow-lg">
                <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest">Login Sebagai</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-black text-white">SUPER ADMIN</span>
                  <button onClick={handleLogout} className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-500 transition-colors">
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            )}
            
            {isInfoLoggedIn && (
              <div className="mt-6 p-4 bg-sky-50/60 rounded-2xl border border-sky-100 flex flex-col gap-2 animate-in fade-in">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Login Sebagai</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-black text-sky-700">INFORMASI</span>
                  <button onClick={handleLogout} className="p-1.5 bg-white text-rose-500 rounded-lg shadow-sm hover:bg-rose-50 transition-colors">
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 px-6 py-4 space-y-4 overflow-y-auto scrollbar-hide">
            {navItems.map((item) => (
              <button 
                key={item.id} 
                onClick={() => setActiveTab(item.id)} 
                className={`w-full flex items-center p-4 rounded-[1.5rem] transition-all duration-300 group ${activeTab === item.id ? 'bg-white shadow-xl shadow-indigo-100 text-indigo-600' : 'text-slate-700 hover:bg-white/50 hover:text-slate-900'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mr-4 transition-all ${activeTab === item.id ? `${item.activeIconBg} text-white shadow-lg` : 'bg-slate-100 text-slate-500 group-hover:bg-white'}`}>
                  <item.icon size={20} />
                </div>
                <span className={`text-xs font-bold uppercase tracking-wide`}>{item.label}</span>
              </button>
            ))}
            
            {!isStaffLoggedIn && !isAdmin && !isInfoLoggedIn && (
              <button 
                onClick={() => setShowLoginModal(true)} 
                className="w-full flex items-center p-4 rounded-[1.5rem] transition-all text-slate-700 hover:bg-white/80 hover:text-indigo-600 hover:shadow-lg"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mr-4 bg-slate-100 text-slate-500">
                  <Lock size={20} />
                </div>
                <span className="text-xs font-black uppercase tracking-widest">Login Petugas</span>
              </button>
            )}
          </nav>
        </aside>

        {/* NAVIGATION BAR MOBILE */}
        <nav className="fixed bottom-6 left-6 right-6 h-20 bg-slate-900/90 backdrop-blur-2xl rounded-full shadow-2xl flex justify-around items-center border border-white/10 z-50 md:hidden px-2">
          {navItems.map((item) => (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id)} 
              className={`flex flex-col items-center p-2 rounded-2xl transition-all duration-300 ${activeTab === item.id ? '-translate-y-6' : 'opacity-60'}`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-1 transition-all shadow-lg ${activeTab === item.id ? `${item.activeIconBg} text-white ring-4 ring-slate-900` : 'bg-transparent text-slate-300 shadow-none'}`}>
                <item.icon size={22} />
              </div>
              {activeTab === item.id && (
                <span className="text-[9px] font-black uppercase tracking-tight text-slate-900 absolute -bottom-4 bg-white/90 backdrop-blur px-2 py-0.5 rounded-full shadow-sm">
                  {item.label.split(' ')[0]}
                </span>
              )}
            </button>
          ))}
          {!isStaffLoggedIn && !isAdmin && !isInfoLoggedIn && (
            <button 
              onClick={() => setShowLoginModal(true)} 
              className={`flex flex-col items-center p-2 rounded-2xl transition-all duration-300 opacity-60 hover:opacity-100`}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-1 transition-all shadow-none bg-transparent text-slate-300">
                <Lock size={22} />
              </div>
            </button>
          )}
        </nav>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 h-full overflow-hidden relative md:ml-72 flex flex-col">
          {/* Header Mobile */}
          <header className="px-6 py-6 flex flex-col gap-4 bg-transparent shrink-0 z-40 md:hidden">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/50 backdrop-blur rounded-xl flex items-center justify-center shadow-lg text-indigo-700">
                  <Activity size={24} />
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tighter uppercase leading-none text-indigo-700">SIPAS</h1>
                  <span className="text-[10px] font-bold text-indigo-600 tracking-widest block">RSUD LEBONG</span>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wide flex items-center gap-2 backdrop-blur-md border border-white/30 shadow-lg ${dbStatus === 'online' ? 'bg-emerald-100/80 text-emerald-700' : 'bg-red-100/80 text-red-700'}`}>
                <div className={`w-2 h-2 rounded-full ${dbStatus === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                {dbStatus}
              </div>
            </div>
            
            {(isStaffLoggedIn || isAdmin || isInfoLoggedIn) && (
              <div className="flex justify-between items-center bg-white/40 backdrop-blur-md p-3 rounded-2xl border border-white/40 shadow-sm animate-in slide-in-from-top-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                    <User size={16} />
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Login</p>
                    <h2 className="text-xs font-black text-indigo-700 uppercase">
                      {isAdmin ? 'SUPER ADMIN' : isInfoLoggedIn ? 'INFORMASI' : rooms.find(r => r.id === loggedInRoomId)?.name}
                    </h2>
                  </div>
                </div>
                <button onClick={handleLogout} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 md:pb-10 scrollbar-hide">
            <div className="max-w-7xl mx-auto w-full space-y-6">
              {activeTab === 'dashboard' && renderDashboard()}
              {activeTab === 'search' && renderSearch()}

              {/* AREA INPUT DATA RUANGAN */}
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
                                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" size={16} />
                              </div>
                            )}
                            <div className="relative w-full md:w-auto flex-1">
                              <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500" size={18} />
                              <input 
                                type="date" 
                                value={report.date} 
                                onChange={e => setReport({ ...report, date: e.target.value })} 
                                className="w-full bg-slate-50 pl-12 pr-6 py-3 rounded-2xl text-base font-black border-2 border-transparent focus:border-indigo-100 outline-none text-slate-700 shadow-inner" 
                              />
                            </div>
                          </div>
                        </div>
                      </GlassContainer>
                      
                      <div className={`grid grid-cols-1 ${isAdmin && !adminSelectedRoomId ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-6`}>
                        {visibleRooms.map(room => (
                          <RoomCard 
                            key={room.id} 
                            room={room} 
                            report={finalReport} 
                            onChange={(k, v) => setReport(p => ({ ...p, [k]: v }))} 
                            onSave={() => handleSaveReport()} 
                            isAdmin={isAdmin} 
                            onDeleteRoom={(id) => setConfirmModal({ isOpen: true, type: 'room', id, message: 'Hapus ruangan ini?' })} 
                            onUpdateName={handleUpdateRoomName} 
                          />
                        ))}
                      </div>

                      {/* DAFTAR PASIEN RUANGAN */}
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
                                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg ${p.gender === 'Laki-Laki' ? 'bg-blue-500 text-white' : 'bg-rose-50 text-white'}`}>
                                    {p.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="font-black text-slate-800 text-lg">{p.name}</p>
                                    <p className="text-xs text-slate-500 mt-1">{p.address || 'Alamat tidak diisi'}</p>
                                    <div className="flex gap-2 mt-2 items-center flex-wrap">
                                      <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-lg font-bold text-slate-500 uppercase">{p.gender}</span>
                                      <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-lg font-bold text-slate-500 uppercase">{p.age} Thn</span>
                                      
                                      {['OK (BEDAH SENTRAL)', 'KAMAR OPERASI'].some(r => p.room.toUpperCase().includes(r)) ? (
                                        <>
                                          <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded-lg font-bold uppercase">{p.specialization}</span>
                                          <span className="text-[10px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded-lg font-bold uppercase">{p.operationCategory}</span>
                                        </>
                                      ) : p.room.toUpperCase().includes('POLI') ? (
                                        <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-lg font-bold uppercase">{p.visitType}</span>
                                      ) : (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold uppercase ${p.status === 'Dirawat /Inap' || ['Pindah Ruangan', 'Observasi'].includes(p.followUp) ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                                          {['IGD', 'IGD PONEK'].includes(p.room) ? p.followUp : p.status}
                                        </span>
                                      )}
                                      
                                      <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold uppercase ${p.paymentStatus === 'BPJS' ? 'bg-sky-100 text-sky-600' : p.paymentStatus === 'Keringanan (Cost Sharing)' ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>
                                        {p.paymentStatus}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <div className="flex gap-2">
                                    <button onClick={() => { setEditingPatient(p); setPatientFormData(p); setIsPatientModalOpen(true); }} className="p-3 bg-indigo-50 rounded-xl text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors shadow-sm">
                                      <Edit3 size={18} />
                                    </button>
                                    <button onClick={() => setConfirmModal({ isOpen: true, type: 'patient', id: p.id, message: `Hapus pasien ${p.name}?` })} className="p-3 bg-rose-50 rounded-xl text-rose-600 hover:bg-rose-600 hover:text-white transition-colors shadow-sm">
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                  <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                                    {['OK (BEDAH SENTRAL)', 'KAMAR OPERASI'].some(r => p.room.toUpperCase().includes(r)) ? 'Operasi' : 'Masuk'}: {formatDateID(p.admissionDate)}
                                  </span>
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

              {/* AREA EKSPOR LAPORAN */}
              {activeTab === 'download' && (
                <div className="h-full flex flex-col gap-6 pb-20">
                  <GlassContainer className="p-8 rounded-[2.5rem] flex flex-col gap-6 h-full overflow-hidden">
                    <div className="flex flex-col gap-6 border-b border-slate-200 pb-6">
                      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                        <div>
                          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                            <FileSpreadsheet className="text-blue-600" />Export Data
                          </h2>
                          <p className="text-slate-500 text-sm mt-1">Pratinjau dan unduh data laporan pasien.</p>
                        </div>
                        <div className="flex items-center gap-4">
                          {isAdmin && (
                            <div className="relative">
                              <select 
                                className="appearance-none bg-slate-100 border border-slate-200 text-slate-700 py-3 pl-4 pr-10 rounded-xl font-bold text-xs focus:ring-2 focus:ring-blue-500 outline-none uppercase" 
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
                      
                      <div className="bg-slate-50 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center border border-slate-200">
                        <div className="flex items-center gap-2 w-full md:w-auto">
                          <div className="bg-white p-2 rounded-xl border border-slate-200 text-slate-400">
                            <CalendarRange size={18} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bulan Laporan</span>
                            <input type="month" className="bg-transparent font-bold text-slate-700 text-sm outline-none w-full" value={downloadSettings.month} onChange={(e) => setDownloadSettings({...downloadSettings, month: e.target.value})}/>
                          </div>
                        </div>
                        <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
                        <div className="flex flex-col md:flex-row gap-2 w-full">
                          <label className={`flex-1 p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${downloadSettings.mode === 'mtd' ? 'border-emerald-500 bg-emerald-50' : 'border-transparent bg-white hover:bg-slate-100'}`}>
                            <input type="radio" name="downloadMode" className="hidden" checked={downloadSettings.mode === 'mtd'} onChange={() => setDownloadSettings({...downloadSettings, mode: 'mtd'})} />
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${downloadSettings.mode === 'mtd' ? 'border-emerald-500' : 'border-slate-300'}`}>
                              {downloadSettings.mode === 'mtd' && <div className="w-2 h-2 bg-emerald-500 rounded-full" />}
                            </div>
                            <div className="flex flex-col">
                              <span className={`text-xs font-black uppercase ${downloadSettings.mode === 'mtd' ? 'text-emerald-700' : 'text-slate-600'}`}>Rekapan Awal Bulan s/d Hari Ini</span>
                              <span className="text-[9px] font-bold text-slate-400">Data Real Time (s/d {new Date().getDate()} {new Date().toLocaleString('id-ID', { month: 'short' })})</span>
                            </div>
                          </label>
                          <label className={`flex-1 p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${downloadSettings.mode === 'full' ? 'border-indigo-500 bg-indigo-50' : 'border-transparent bg-white hover:bg-slate-100'}`}>
                            <input type="radio" name="downloadMode" className="hidden" checked={downloadSettings.mode === 'full'} onChange={() => setDownloadSettings({...downloadSettings, mode: 'full'})} />
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${downloadSettings.mode === 'full' ? 'border-indigo-500' : 'border-slate-300'}`}>
                              {downloadSettings.mode === 'full' && <div className="w-2 h-2 bg-indigo-500 rounded-full" />}
                            </div>
                            <div className="flex flex-col">
                              <span className={`text-xs font-black uppercase ${downloadSettings.mode === 'full' ? 'text-indigo-700' : 'text-slate-600'}`}>Rekapan Satu Bulan Penuh</span>
                              <span className="text-[9px] font-bold text-slate-400">Semua Data di Bulan Terpilih</span>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl relative bg-white shadow-sm">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-indigo-600 text-white font-bold uppercase tracking-wider">
                          <tr>
                            <th className="p-4">No</th>
                            <th className="p-4">Ruangan</th>
                            <th className="p-4">Nama</th>
                            <th className="p-4">JK</th>
                            <th className="p-4">Usia</th>
                            <th className="p-4">Alamat</th>
                            <th className="p-4">Tgl Masuk</th>
                            <th className="p-4">Tgl Keluar</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredDownloadData.length > 0 ? (
                            filteredDownloadData.map((p, i) => (
                              <tr key={p.id} className="hover:bg-indigo-50/50 transition-colors group">
                                <td className="p-4 font-bold text-slate-500 text-center border-r border-slate-100">{i + 1}</td>
                                <td className="p-4 border-r border-slate-100 whitespace-nowrap">{p.room}</td>
                                <td className="p-4 font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">{p.name}</td>
                                <td className="p-4 border-r border-slate-100 text-center">{p.gender === 'Laki-Laki' ? 'L' : 'P'}</td>
                                <td className="p-4 text-center border-r border-slate-100">{p.age} Th</td>
                                <td className="p-4 border-r border-slate-100 max-w-[150px] truncate" title={p.address}>{p.address || '-'}</td>
                                <td className="p-4 border-r border-slate-100 whitespace-nowrap">{formatDateID(p.admissionDate)}</td>
                                <td className="p-4 border-r border-slate-100 whitespace-nowrap">{p.outcomeDate ? formatDateID(p.outcomeDate) : '-'}</td>
                                <td className="p-4 border-r border-slate-100 text-center">
                                  <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap ${p.paymentStatus === 'BPJS' ? 'bg-sky-100 text-sky-700' : p.paymentStatus === 'Keringanan (Cost Sharing)' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {p.paymentStatus}
                                  </span>
                                </td>
                                <td className="p-4 border-r border-slate-100">
                                  {p.room.includes('POLI') ? (p.followUpService || p.diagnosisPrimary) : (['IGD', 'IGD PONEK'].includes(p.room) ? p.followUp : p.status)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="10" className="p-10 text-center text-slate-400 font-bold">Tidak ada data untuk filter bulan/jenis rekapan ini.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Total Data Terfilter: {filteredDownloadData.length} Pasien
                    </div>
                  </GlassContainer>
                </div>
              )}

              {/* AREA ARSIP LAPORAN HARIAN */}
              {activeTab === 'history' && (
                <div className="space-y-6 animate-in slide-in-from-right duration-500 pb-32">
                  <GlassContainer className="p-8 rounded-[2.5rem] flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Arsip Laporan</h2>
                    <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500">
                      <ClipboardList size={28} />
                    </div>
                  </GlassContainer>
                  
                  <div className="grid gap-4">
                    {savedReports.map(item => (
                      <GlassContainer key={item.id} className="p-6 rounded-[2rem] flex flex-col md:flex-row justify-between items-center gap-6 hover:border-indigo-300 transition-colors group">
                        <div className="flex items-center gap-6">
                          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-500/30">
                            {new Date(item.date).getDate()}
                          </div>
                          <div>
                            <h4 className="font-black text-slate-800 uppercase text-lg tracking-tight">{formatDateID(item.date)}</h4>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest opacity-80 mt-1">
                              Diinput: {new Date(item.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => { setEditFormData(item); setEditingId(item.id); }} 
                            className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                          >
                            <Edit3 size={20} />
                          </button>
                          <button 
                            onClick={() => setConfirmModal({ isOpen: true, type: 'report', id: item.id, message: 'Hapus data laporan ini secara permanen?' })} 
                            className="p-3 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </GlassContainer>
                    ))}
                  </div>
                </div>
              )}

              {/* AREA PENGATURAN ADMIN */}
              {activeTab === 'settings' && (
                <div className="space-y-8 animate-in slide-in-from-right duration-500 pb-32">
                  <GlassContainer className="p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-8 flex items-center gap-4 relative z-10">
                      <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><ShieldCheck size={28} /></div> 
                      Keamanan Admin
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                      <div className="space-y-4">
                        <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Identitas Admin</h5>
                        <div className="grid grid-cols-2 gap-4">
                          <input 
                            type="text" 
                            className="w-full bg-white/50 rounded-2xl p-5 font-bold text-sm outline-none border border-slate-200 focus:border-indigo-500 text-slate-700 transition-colors" 
                            value={authSettings.adminUsername} 
                            onChange={e => setAuthSettings({ ...authSettings, adminUsername: e.target.value })} 
                          />
                          <input 
                            type="password" 
                            className="w-full bg-white/50 rounded-2xl p-5 font-bold outline-none border border-slate-200 focus:border-indigo-500 text-slate-700 transition-colors" 
                            value={authSettings.adminPassword} 
                            onChange={e => setAuthSettings({ ...authSettings, adminPassword: e.target.value })} 
                          />
                        </div>
                        <button onClick={() => updateCredentials(authSettings)} className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 hover:bg-black transition-all">
                          Update Admin
                        </button>
                      </div>
                    </div>

                    <div className="mt-12 pt-10 border-t border-slate-200 relative z-10">
                      <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 ml-1">Tambah Ruangan Baru</h5>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div className="space-y-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase ml-1">ID Ruangan (Tanpa Spasi)</span>
                          <input type="text" className="w-full bg-white/50 rounded-2xl p-4 font-bold text-xs outline-none border border-slate-200 focus:border-indigo-500 text-slate-700" placeholder="CONTOH: MELATI" value={newRoomData.id} onChange={e => setNewRoomData({ ...newRoomData, id: e.target.value.toUpperCase().replace(/\s/g, '') })} />
                        </div>
                        <div className="space-y-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Nama Ruangan</span>
                          <input type="text" className="w-full bg-white/50 rounded-2xl p-4 font-bold text-xs outline-none border border-slate-200 focus:border-indigo-500 text-slate-700" placeholder="Ruang Melati" value={newRoomData.name} onChange={e => setNewRoomData({ ...newRoomData, name: e.target.value })} />
                        </div>
                        <button onClick={handleAddRoom} className="bg-indigo-600 text-white p-4 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 hover:bg-indigo-700 transition-all flex justify-center items-center gap-2">
                          <Plus size={18} /> Tambah
                        </button>
                      </div>
                    </div>

                    <div className="mt-12 pt-10 border-t border-slate-200 relative z-10">
                      <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 ml-1">Manajemen Akun Petugas</h5>
                      
                      {/* Akun Informasi */}
                      <div className="p-6 bg-sky-50/50 rounded-[2rem] flex flex-col md:flex-row gap-6 items-center border border-sky-100 shadow-sm mb-6">
                        <div className="w-full md:w-1/4">
                          <label className="text-xs font-black uppercase text-sky-700 block mb-1">Petugas Informasi</label>
                          <span className="text-[10px] bg-sky-100 text-sky-500 font-bold px-2 py-1 rounded-lg">ID: informasi</span>
                        </div>
                        <div className="flex gap-4 w-full md:w-3/4 items-end">
                          <div className="flex-1 space-y-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Password Akses</span>
                            <input type="text" className="w-full bg-white rounded-xl p-3 text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-sky-100" value={authSettings.infoPassword || '123'} onChange={e => setAuthSettings({ ...authSettings, infoPassword: e.target.value })} />
                          </div>
                          <button onClick={() => updateCredentials(authSettings)} className="bg-sky-500 text-white p-3 rounded-xl shadow-lg shadow-sky-500/30 hover:bg-sky-600 transition-colors">
                            <Save size={18} />
                          </button>
                        </div>
                      </div>

                      {/* Akun Buka Nama */}
                      <div className="p-6 bg-emerald-50/50 rounded-[2rem] flex flex-col md:flex-row gap-6 items-center border border-emerald-100 shadow-sm mb-6">
                        <div className="w-full md:w-1/4">
                          <label className="text-xs font-black uppercase text-emerald-700 block mb-1">Kode Akses Buka Nama</label>
                          <span className="text-[10px] bg-emerald-100 text-emerald-500 font-bold px-2 py-1 rounded-lg">Utk: Tombol Gembok</span>
                        </div>
                        <div className="flex gap-4 w-full md:w-3/4 items-end">
                          <div className="flex-1 space-y-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Kode Rahasia</span>
                            <input type="text" className="w-full bg-white rounded-xl p-3 text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-emerald-100" value={authSettings.publicAccessCode || '123'} onChange={e => setAuthSettings({ ...authSettings, publicAccessCode: e.target.value })} />
                          </div>
                          <button onClick={() => updateCredentials(authSettings)} className="bg-emerald-500 text-white p-3 rounded-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-colors">
                            <Save size={18} />
                          </button>
                        </div>
                      </div>

                      {/* Akun Ruangan */}
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
                                  <input type="text" className="w-full bg-white rounded-xl p-3 text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-indigo-100" value={roomNameEdits[room.id] || room.name} onChange={e => setRoomNameEdits({ ...roomNameEdits, [room.id]: e.target.value })} />
                                </div>
                                <div className="flex-1 space-y-2">
                                  <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Username</span>
                                  <input type="text" className="w-full bg-white rounded-xl p-3 text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-indigo-100" value={creds.username} onChange={e => { const newUsername = e.target.value; setAuthSettings(prev => ({ ...prev, roomAccess: { ...prev.roomAccess, [room.id]: { ...creds, username: newUsername } } })) }} />
                                </div>
                                <div className="flex-1 space-y-2">
                                  <span className="text-[9px] font-black text-slate-400 uppercase ml-1">Password</span>
                                  <input type="text" className="w-full bg-white rounded-xl p-3 text-xs font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-indigo-100" value={creds.password} onChange={e => { const newPass = e.target.value; setAuthSettings(prev => ({ ...prev, roomAccess: { ...prev.roomAccess, [room.id]: { ...creds, password: newPass } } })) }} />
                                </div>
                                <button onClick={() => saveRoomConfiguration(room.id, roomNameEdits[room.id] || room.name, creds.username, creds.password)} className="bg-emerald-500 text-white p-3 rounded-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-colors">
                                  <Save size={18} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </GlassContainer>
                </div>
              )}
            </div>
          </div>
        </main>
        
        {/* MODAL FORM PASIEN (FULLSCREEN) */}
        {isPatientModalOpen && (
          <div className="fixed inset-0 z-[5000] bg-white flex flex-col animate-in slide-in-from-bottom-4 duration-300">
            {/* Header Modal */}
            <div className="shrink-0 px-6 md:px-10 py-5 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-50">
              <div>
                <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-3">
                  <div className="bg-indigo-600 text-white p-2 rounded-lg"><UserPlus size={24} /></div>
                  Data Pasien
                </h2>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1 ml-1">
                  {patientFormData.room ? `Input Data Ruangan: ${patientFormData.room}` : 'Formulir Pasien Baru'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsPatientModalOpen(false)} 
                  className="p-3 bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 rounded-full transition-all group"
                >
                  <X size={24} className="group-hover:rotate-90 transition-transform" />
                </button>
              </div>
            </div>

            {/* Konten Modal Form */}
            <div className="flex-1 overflow-y-auto bg-slate-50/50 scrollbar-hide">
                <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 pb-16">
                    <form onSubmit={handlePatientSubmit} className="space-y-8 bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                      
                      {/* TAMPILAN FORM POLIKLINIK */}
                      {patientFormData.room.toUpperCase().includes('POLI') ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                          <div className="space-y-6">
                            <h4 className="text-sm font-black text-emerald-600 uppercase tracking-widest border-b-2 border-emerald-100 pb-3 mb-6 flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">1</div> 
                              Identitas & Status
                            </h4>
                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tanggal Kunjungan</label>
                                <input required type="date" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500 transition-all" value={patientFormData.admissionDate} onChange={e => setPatientFormData({ ...patientFormData, admissionDate: e.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">No. RM</label>
                                <input required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500 transition-all" value={patientFormData.mrn} onChange={e => setPatientFormData({ ...patientFormData, mrn: e.target.value })} placeholder="00-00-00" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Nama Pasien</label>
                              <input required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.name} onChange={e => setPatientFormData({ ...patientFormData, name: e.target.value })} placeholder="Nama Lengkap" />
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tanggal Lahir</label>
                                <input type="date" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.birthDate} onChange={(e) => { const val = e.target.value; const { years, months, days } = calculateAgeDetail(val); setPatientFormData({ ...patientFormData, birthDate: val, age: years, ageMonth: months, ageDay: days }); }} />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Jenis Kelamin</label>
                                <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.gender} onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}>
                                  <option value="Laki-Laki">Laki-Laki</option>
                                  <option value="Perempuan">Perempuan</option>
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Thn</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200" value={patientFormData.age} onChange={e => setPatientFormData({ ...patientFormData, age: e.target.value })} /></div>
                              <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Bln</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200" value={patientFormData.ageMonth} onChange={e => setPatientFormData({ ...patientFormData, ageMonth: e.target.value })} /></div>
                              <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Hr</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200" value={patientFormData.ageDay} onChange={e => setPatientFormData({ ...patientFormData, ageDay: e.target.value })} /></div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Alamat</label>
                              <textarea rows="3" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none resize-none focus:border-emerald-500 transition-all" value={patientFormData.address} onChange={e => setPatientFormData({ ...patientFormData, address: e.target.value })}></textarea>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Jenis Kunjungan</label>
                                <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.visitType} onChange={e => setPatientFormData({ ...patientFormData, visitType: e.target.value })}>
                                  <option value="Baru">Baru</option>
                                  <option value="Lama">Lama</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Cara Bayar</label>
                                <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.paymentStatus} onChange={e => setPatientFormData({ ...patientFormData, paymentStatus: e.target.value })}>
                                  <option value="Umum">Umum</option>
                                  <option value="BPJS">BPJS</option>
                                  <option value="Keringanan (Cost Sharing)">Keringanan (Cost Sharing)</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-6">
                            <h4 className="text-sm font-black text-emerald-600 uppercase tracking-widest border-b-2 border-emerald-100 pb-3 mb-6 flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">2</div> 
                              Diagnosa & Layanan
                            </h4>
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Diagnosa Utama</label>
                              <textarea rows="2" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500 transition-all" value={patientFormData.diagnosisPrimary} onChange={e => setPatientFormData({ ...patientFormData, diagnosisPrimary: e.target.value })}></textarea>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Kode ICD-10</label>
                                <input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.icd10Code} onChange={e => setPatientFormData({ ...patientFormData, icd10Code: e.target.value })} />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">DPJP</label>
                                <input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.doctorDPJP} onChange={e => setPatientFormData({ ...patientFormData, doctorDPJP: e.target.value })} />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Diagnosa Sekunder</label>
                              <textarea rows="2" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500 transition-all" value={patientFormData.diagnosisSecondary} onChange={e => setPatientFormData({ ...patientFormData, diagnosisSecondary: e.target.value })}></textarea>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Spesialisasi</label>
                              <select 
                                className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" 
                                value={patientFormData.specialization} 
                                onChange={e => setPatientFormData({ ...patientFormData, specialization: e.target.value })}
                              >
                                <option value="">-- Pilih Spesialisasi --</option>
                                {['Penyakit Dalam', 'Bedah', 'Kesehatan Anak', 'Kesehatan Remaja', 'Obstetri', 'Ginekologi', 'Keluarga Berencana', 'Saraf (Non Stroke)', 'Jiwa', 'THT', 'Mata', 'Kulit dan Kelamin', 'Gigi dan Mulut', 'Radiologi', 'Paru', 'Kardiologi', 'Kanker', 'Uronefrologi', 'Saraf (Stroke)', 'Spesialisasi Lain', 'Tidak Ada Data'].map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              {patientFormData.specialization === 'Spesialisasi Lain' && (
                                <input placeholder="Tulis Spesialisasi Manual..." className="w-full bg-emerald-50 rounded-2xl py-4 px-5 text-sm font-bold border border-emerald-200 outline-none mt-2 text-emerald-700" value={patientFormData.specializationManual} onChange={e => setPatientFormData({ ...patientFormData, specializationManual: e.target.value })} />
                              )}
                            </div>
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Keterangan Masuk</label>
                              <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.entryStatus} onChange={e => setPatientFormData({ ...patientFormData, entryStatus: e.target.value })}>
                                {['Non Rujukan', 'Rujukan dari Puskesmas', 'Rujukan dari Faskes Lain', 'Rujukan dari RS Lain', 'Diterima Kembali'].map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tindak Lanjut Pelayanan</label>
                                <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.followUpService} onChange={e => setPatientFormData({ ...patientFormData, followUpService: e.target.value })}>
                                    {['Dirawat', 'Dikembalikan ke Puskesmas', 'Dikembalikan ke Faskes Lain', 'Dikembalikan ke RS Asal', 'Dirujuk Keluar Pasien Rujukan', 'Dirujuk Keluar Pasien Datang Sendiri', 'Pulang'].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* TAMPILAN FORM RAWAT INAP / IGD / OK */
                        <div className="space-y-8">
                          {['IGD', 'IGD PONEK'].includes(patientFormData.room) ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                              <div className="space-y-6">
                                <h4 className="text-sm font-black text-indigo-500 uppercase tracking-widest border-b-2 border-indigo-100 pb-3 mb-6 flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">1</div> 
                                  Identitas & Medis
                                </h4>
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tanggal Masuk</label>
                                  <input type="date" required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.admissionDate} onChange={e => setPatientFormData({ ...patientFormData, admissionDate: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">No. Rekam Medis</label>
                                    <input required className="w-full bg-slate-50 rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.mrn} onChange={e => setPatientFormData({ ...patientFormData, mrn: e.target.value })} placeholder="00-00-00" />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">NIK / No BPJS</label>
                                    <input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.nik} onChange={e => setPatientFormData({ ...patientFormData, nik: e.target.value })} placeholder="16 Digit NIK" />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Nama Pasien</label>
                                  <input required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.name} onChange={e => setPatientFormData({ ...patientFormData, name: e.target.value })} placeholder="Nama Lengkap" />
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Jenis Kelamin</label>
                                    <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.gender} onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}>
                                      <option value="Laki-Laki">Laki-Laki</option>
                                      <option value="Perempuan">Perempuan</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tanggal Lahir</label>
                                    <input type="date" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.birthDate} onChange={(e) => { const val = e.target.value; const { years, months, days } = calculateAgeDetail(val); setPatientFormData({ ...patientFormData, birthDate: val, age: years, ageMonth: months, ageDay: days }); }} />
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Umur (Thn)</label><input type="number" required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.age} onChange={e => setPatientFormData({ ...patientFormData, age: e.target.value })} placeholder="0" /></div>
                                  <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Bulan</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.ageMonth} onChange={e => setPatientFormData({ ...patientFormData, ageMonth: e.target.value })} placeholder="0" /></div>
                                  <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Hari</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.ageDay} onChange={e => setPatientFormData({ ...patientFormData, ageDay: e.target.value })} placeholder="0" /></div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Alamat Domisili</label>
                                  <textarea rows="3" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none resize-none" value={patientFormData.address} onChange={e => setPatientFormData({ ...patientFormData, address: e.target.value })} placeholder="Alamat lengkap..."></textarea>
                                </div>
                                <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Dokter IGD</label><input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.doctorIGD} onChange={e => setPatientFormData({ ...patientFormData, doctorIGD: e.target.value })} placeholder="Nama Dokter Jaga" /></div>
                                <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Dokter DPJP</label><input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.doctorDPJP} onChange={e => setPatientFormData({ ...patientFormData, doctorDPJP: e.target.value })} placeholder="Nama Dokter DPJP" /></div>
                              </div>
                              <div className="space-y-6">
                                <h4 className="text-sm font-black text-emerald-500 uppercase tracking-widest border-b-2 border-emerald-100 pb-3 mb-6 flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">2</div> 
                                  Status & Tindakan
                                </h4>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Keterangan Masuk</label>
                                    <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.entryStatus} onChange={e => setPatientFormData({ ...patientFormData, entryStatus: e.target.value })}>
                                      <option value="Non Rujukan">Non Rujukan</option>
                                      <option value="Rujukan Puskesmas">Rujukan Puskesmas</option>
                                      <option value="Rujukan Faskes Lain">Rujukan Faskes Lain</option>
                                      <option value="Rujukan RS Lain">Rujukan RS Lain</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Cara Bayar</label>
                                    <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.paymentStatus} onChange={e => setPatientFormData({ ...patientFormData, paymentStatus: e.target.value })}>
                                      <option value="BPJS">JKN / BPJS</option>
                                      <option value="Umum">UMUM</option>
                                      <option value="Keringanan (Cost Sharing)">Keringanan (Cost Sharing)</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Jenis Pelayanan</label>
                                  <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.serviceType} onChange={e => setPatientFormData({ ...patientFormData, serviceType: e.target.value })}>
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
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Diagnosa Utama</label>
                                  <textarea rows="2" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500 resize-none" value={patientFormData.diagnosisPrimary} onChange={e => setPatientFormData({ ...patientFormData, diagnosisPrimary: e.target.value })} placeholder="Diagnosa ICD-10"></textarea>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Diagnosa Sekunder</label>
                                  <textarea rows="2" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500 resize-none" value={patientFormData.diagnosisSecondary} onChange={e => setPatientFormData({ ...patientFormData, diagnosisSecondary: e.target.value })} placeholder="Diagnosa Tambahan"></textarea>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tindak Lanjut</label>
                                    <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.followUp} onChange={e => setPatientFormData({ ...patientFormData, followUp: e.target.value })}>
                                      <option value="Pindah Ruangan">Pindah Ruangan</option>
                                      <option value="Observasi">Observasi</option>
                                      <option value="Dirujuk">Dirujuk</option>
                                      <option value="Pulang">Pulang</option>
                                      <option value="Meninggal di IGD">Meninggal di IGD</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Ket. Keluar</label>
                                    <input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-emerald-500" value={patientFormData.exitNote} onChange={e => setPatientFormData({ ...patientFormData, exitNote: e.target.value })} placeholder="Cth: R. PDL / Rawat Jalan" />
                                  </div>
                                </div>
                                
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 grid grid-cols-2 gap-4">
                                  <label className="flex items-center space-x-3 cursor-pointer checkbox-wrapper">
                                    <input type="checkbox" className="hidden" checked={patientFormData.isDeadInIGD} onChange={e => setPatientFormData({...patientFormData, isDeadInIGD: e.target.checked})} />
                                    <div className="w-5 h-5 border-2 border-slate-300 rounded flex items-center justify-center transition-colors bg-white">
                                      <Check size={12} className="text-white hidden" strokeWidth={4} />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase">Meninggal di IGD</span>
                                  </label>
                                  <label className="flex items-center space-x-3 cursor-pointer checkbox-wrapper">
                                    <input type="checkbox" className="hidden" checked={patientFormData.isDOA} onChange={e => setPatientFormData({...patientFormData, isDOA: e.target.checked})} />
                                    <div className="w-5 h-5 border-2 border-slate-300 rounded flex items-center justify-center transition-colors bg-white">
                                      <Check size={12} className="text-white hidden" strokeWidth={4} />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase">DOA</span>
                                  </label>
                                  <label className="flex items-center space-x-3 cursor-pointer checkbox-wrapper">
                                    <input type="checkbox" className="hidden" checked={patientFormData.isInjury} onChange={e => setPatientFormData({...patientFormData, isInjury: e.target.checked})} />
                                    <div className="w-5 h-5 border-2 border-slate-300 rounded flex items-center justify-center transition-colors bg-white">
                                      <Check size={12} className="text-white hidden" strokeWidth={4} />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase">Luka-Luka</span>
                                  </label>
                                  <label className="flex items-center space-x-3 cursor-pointer checkbox-wrapper">
                                    <input type="checkbox" className="hidden" checked={patientFormData.isFalseEmergency} onChange={e => setPatientFormData({...patientFormData, isFalseEmergency: e.target.checked})} />
                                    <div className="w-5 h-5 border-2 border-slate-300 rounded flex items-center justify-center transition-colors bg-white">
                                      <Check size={12} className="text-white hidden" strokeWidth={4} />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase">False Emergency</span>
                                  </label>
                                </div>
                              </div>
                            </div>
                          ) : ['OK (BEDAH SENTRAL)', 'KAMAR OPERASI'].some(r => patientFormData.room.toUpperCase().includes(r)) ? (
                            /* FORM KHUSUS KAMAR OPERASI */
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                <div className="space-y-6">
                                  <h4 className="text-sm font-black text-pink-600 uppercase tracking-widest border-b-2 border-pink-100 pb-3 mb-6 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-pink-100 flex items-center justify-center text-pink-600">1</div> 
                                    Identitas Pasien
                                  </h4>
                                  <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">No. Rekam Medis</label>
                                      <input required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-pink-500 transition-all" value={patientFormData.mrn} onChange={e => setPatientFormData({ ...patientFormData, mrn: e.target.value })} placeholder="00-00-00" />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">NIK / No BPJS</label>
                                      <input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-pink-500 transition-all" value={patientFormData.nik} onChange={e => setPatientFormData({ ...patientFormData, nik: e.target.value })} placeholder="16 Digit NIK" />
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Nama Pasien</label>
                                    <input required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-pink-500 transition-all" value={patientFormData.name} onChange={e => setPatientFormData({ ...patientFormData, name: e.target.value })} placeholder="Nama Lengkap" />
                                  </div>
                                  <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Jenis Kelamin</label>
                                      <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-pink-500" value={patientFormData.gender} onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}>
                                        <option value="Laki-Laki">Laki-Laki</option>
                                        <option value="Perempuan">Perempuan</option>
                                      </select>
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tanggal Lahir</label>
                                      <input type="date" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-pink-500" value={patientFormData.birthDate} onChange={(e) => { const val = e.target.value; const { years, months, days } = calculateAgeDetail(val); setPatientFormData({ ...patientFormData, birthDate: val, age: years, ageMonth: months, ageDay: days }); }} />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Umur (Thn)</label><input type="number" required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none focus:border-pink-500" value={patientFormData.age} onChange={e => setPatientFormData({ ...patientFormData, age: e.target.value })} placeholder="0" /></div>
                                    <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Bulan</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none focus:border-pink-500" value={patientFormData.ageMonth} onChange={e => setPatientFormData({ ...patientFormData, ageMonth: e.target.value })} placeholder="0" /></div>
                                    <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Hari</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none focus:border-pink-500" value={patientFormData.ageDay} onChange={e => setPatientFormData({ ...patientFormData, ageDay: e.target.value })} placeholder="0" /></div>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Alamat Domisili</label>
                                    <textarea rows="3" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none resize-none" value={patientFormData.address} onChange={e => setPatientFormData({ ...patientFormData, address: e.target.value })} placeholder="Alamat lengkap..."></textarea>
                                  </div>
                                </div>
                                <div className="space-y-6">
                                  <h4 className="text-sm font-black text-purple-600 uppercase tracking-widest border-b-2 border-purple-100 pb-3 mb-6 flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">2</div> 
                                    Detail Operasi
                                  </h4>
                                  <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tanggal Operasi</label>
                                      <input type="date" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-purple-500" value={patientFormData.admissionDate} onChange={e => setPatientFormData({...patientFormData, admissionDate: e.target.value})} />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Cara Bayar</label>
                                      <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-purple-500" value={patientFormData.paymentStatus} onChange={e => setPatientFormData({ ...patientFormData, paymentStatus: e.target.value })}>
                                        <option value="BPJS">BPJS</option>
                                        <option value="Umum">Umum</option>
                                        <option value="Keringanan (Cost Sharing)">Keringanan (Cost Sharing)</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Dokter Operator (DPJP)</label>
                                    <input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-purple-500" value={patientFormData.doctorDPJP} onChange={e => setPatientFormData({ ...patientFormData, doctorDPJP: e.target.value })} placeholder="Nama Dokter Bedah" />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Spesialisasi</label>
                                    <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-purple-500" value={patientFormData.specialization} onChange={e => setPatientFormData({ ...patientFormData, specialization: e.target.value })}>
                                      <option value="">-- Pilih --</option>
                                      {['Bedah', 'Obstetri dan Ginekologi', 'Mata', 'THT', 'Mulut dan Gigi', 'Ortopedi', 'Saraf'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                  </div>
                                  <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Kategori Operasi</label>
                                      <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-purple-500" value={patientFormData.operationCategory} onChange={e => setPatientFormData({ ...patientFormData, operationCategory: e.target.value })}>
                                        <option value="">-- Pilih --</option>
                                        <option value="Khusus">Khusus</option>
                                        <option value="Besar">Besar</option>
                                        <option value="Sedang">Sedang</option>
                                        <option value="Kecil">Kecil</option>
                                      </select>
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Status Operasi</label>
                                      <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-purple-500" value={patientFormData.operationStatus} onChange={e => setPatientFormData({ ...patientFormData, operationStatus: e.target.value })}>
                                        <option value="">-- Pilih --</option>
                                        <option value="Elektif">Elektif</option>
                                        <option value="Cito">Cito</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Diagnosa Pra/Pasca Bedah</label>
                                    <textarea rows="2" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-purple-500 resize-none" value={patientFormData.diagnosisPrimary} onChange={e => setPatientFormData({ ...patientFormData, diagnosisPrimary: e.target.value })} placeholder="Diagnosa Utama"></textarea>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tindak Operasi</label>
                                    <textarea rows="2" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-purple-500 resize-none" value={patientFormData.action} onChange={e => setPatientFormData({ ...patientFormData, action: e.target.value })} placeholder="Jenis Tindakan yang dilakukan"></textarea>
                                  </div>
                                </div>
                            </div>
                          ) : (
                            /* FORM PASIEN RAWAT INAP UMUM */
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                              <div className="space-y-6">
                                <h4 className="text-sm font-black text-indigo-500 uppercase tracking-widest border-b-2 border-indigo-100 pb-3 mb-6 flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">1</div> 
                                  Identitas Pasien
                                </h4>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">No. Rekam Medis</label>
                                    <input required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.mrn} onChange={e => setPatientFormData({ ...patientFormData, mrn: e.target.value })} placeholder="00-00-00" />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">NIK / No BPJS</label>
                                    <input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.nik} onChange={e => setPatientFormData({ ...patientFormData, nik: e.target.value })} placeholder="16 Digit NIK" />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Nama Pasien</label>
                                  <input required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 transition-all" value={patientFormData.name} onChange={e => setPatientFormData({ ...patientFormData, name: e.target.value })} placeholder="Nama Lengkap" />
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Jenis Kelamin</label>
                                    <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.gender} onChange={e => setPatientFormData({ ...patientFormData, gender: e.target.value })}>
                                      <option value="Laki-Laki">Laki-Laki</option>
                                      <option value="Perempuan">Perempuan</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tanggal Lahir</label>
                                    <input type="date" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.birthDate} onChange={(e) => { const val = e.target.value; const { years, months, days } = calculateAgeDetail(val); setPatientFormData({ ...patientFormData, birthDate: val, age: years, ageMonth: months, ageDay: days }); }} />
                                  </div>
                                </div>
                                
                                {patientFormData.room === 'NICU' ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Thn</label><input type="number" required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none" value={patientFormData.age} onChange={e => setPatientFormData({ ...patientFormData, age: e.target.value })} /></div>
                                            <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Bln</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none" value={patientFormData.ageMonth} onChange={e => setPatientFormData({ ...patientFormData, ageMonth: e.target.value })} /></div>
                                            <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Hr</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none" value={patientFormData.ageDay} onChange={e => setPatientFormData({ ...patientFormData, ageDay: e.target.value })} /></div>
                                        </div>
                                        <div className="space-y-2">
                                          <label className="text-[11px] font-bold text-emerald-600 uppercase ml-1">Berat Badan (Gram)</label>
                                          <input type="number" className="w-full bg-emerald-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-black border border-emerald-200 outline-none focus:border-emerald-500 transition-all text-emerald-700" placeholder="Contoh: 3200" value={patientFormData.birthWeight} onChange={e => setPatientFormData({...patientFormData, birthWeight: e.target.value})} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-3">
                                      <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Umur (Thn)</label><input type="number" required className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.age} onChange={e => setPatientFormData({ ...patientFormData, age: e.target.value })} placeholder="0" /></div>
                                      <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Bulan</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.ageMonth} onChange={e => setPatientFormData({ ...patientFormData, ageMonth: e.target.value })} placeholder="0" /></div>
                                      <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Hari</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-2 text-center text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.ageDay} onChange={e => setPatientFormData({ ...patientFormData, ageDay: e.target.value })} placeholder="0" /></div>
                                    </div>
                                )}
                                
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Alamat Domisili</label>
                                  <textarea rows="3" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none resize-none" value={patientFormData.address} onChange={e => setPatientFormData({ ...patientFormData, address: e.target.value })} placeholder="Alamat lengkap..."></textarea>
                                </div>
                              </div>
                              <div className="space-y-6">
                                <h4 className="text-sm font-black text-indigo-500 uppercase tracking-widest border-b-2 border-indigo-100 pb-3 mb-6 flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">2</div> 
                                  Data Perawatan & Diagnosa
                                </h4>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tanggal Masuk</label>
                                    <input type="date" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.admissionDate} onChange={e => setPatientFormData({...patientFormData, admissionDate: e.target.value})} />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tanggal Keluar</label>
                                    <input type="date" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.outcomeDate} onChange={e => setPatientFormData({...patientFormData, outcomeDate: e.target.value})} />
                                  </div>
                                </div>
                                
                                {patientFormData.room === 'NICU' && (
                                    <div className="p-5 bg-indigo-50/50 rounded-3xl border border-indigo-100 space-y-4">
                                        <label className="text-[11px] font-black text-indigo-700 uppercase tracking-widest block border-b border-indigo-100 pb-2">Tindakan</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            {['Pemberian HB 0', 'Pemberian Hb Ig', 'Pemeriksaan SHK', 'Tindakan Lainnya'].map(act => (
                                                <label key={act} className="flex items-center space-x-3 cursor-pointer group">
                                                    <input type="checkbox" className="hidden" checked={(patientFormData.nicuActions || []).includes(act)} onChange={() => toggleNicuAction(act)} />
                                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${(patientFormData.nicuActions || []).includes(act) ? 'bg-indigo-600 border-indigo-600 shadow-md' : 'bg-white border-slate-300'}`}>
                                                      <Check size={12} className="text-white" strokeWidth={4} />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-600 uppercase group-hover:text-indigo-600">{act}</span>
                                                </label>
                                            ))}
                                        </div>
                                        {(patientFormData.nicuActions || []).includes('Tindakan Lainnya') && (
                                            <input className="w-full p-3 bg-white rounded-xl border border-indigo-200 text-[10px] font-bold outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Tulis tindakan lainnya di sini..." value={patientFormData.nicuActionManual} onChange={e => setPatientFormData({...patientFormData, nicuActionManual: e.target.value})} />
                                        )}
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Kelas Perawatan</label>
                                    <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.classRoom} onChange={e => setPatientFormData({...patientFormData, classRoom: e.target.value})}>
                                      <option value="VIP">VIP</option>
                                      <option value="I">Kelas I</option>
                                      <option value="II">Kelas II</option>
                                      <option value="III">Kelas III</option>
                                      <option value="Khusus">Khusus</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Hari Perawatan (HP)</label>
                                    <input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Jml Hari" value={patientFormData.hp} onChange={e => setPatientFormData({...patientFormData, hp: e.target.value})} />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Dokter DPJP</label><input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Nama DPJP" value={patientFormData.doctorDPJP} onChange={e => setPatientFormData({...patientFormData, doctorDPJP: e.target.value})} /></div>
                                  <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Dokter Konsul</label><input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Nama Dr. Konsul" value={patientFormData.doctorKonsul} onChange={e => setPatientFormData({...patientFormData, doctorKonsul: e.target.value})} /></div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Diagnosa Utama</label>
                                  <textarea rows="2" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 resize-none" placeholder="Diagnosa Utama" value={patientFormData.diagnosisPrimary} onChange={e => setPatientFormData({...patientFormData, diagnosisPrimary: e.target.value})}></textarea>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Kode ICD-10</label><input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Kode ICD" value={patientFormData.icd10Code} onChange={e => setPatientFormData({...patientFormData, icd10Code: e.target.value})} /></div>
                                  <div className="space-y-2"><label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tarif (Rp)</label><input type="number" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Nominal" value={patientFormData.tariff} onChange={e => setPatientFormData({...patientFormData, tariff: e.target.value})} /></div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Diagnosa Sekunder</label>
                                  <textarea rows="2" className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500 resize-none" placeholder="Diagnosa Tambahan" value={patientFormData.diagnosisSecondary} onChange={e => setPatientFormData({...patientFormData, diagnosisSecondary: e.target.value})}></textarea>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Tindak Lanjut</label>
                                  <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.followUp} onChange={e => setPatientFormData({ ...patientFormData, followUp: e.target.value })}>
                                    <option value="Dirawat">Dirawat</option>
                                    <option value="Dirujuk">Dirujuk</option>
                                    <option value="Pulang">Pulang</option>
                                  </select>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Cara Bayar</label>
                                    <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.paymentStatus} onChange={e => setPatientFormData({...patientFormData, paymentStatus: e.target.value})}>
                                      <option value="BPJS">BPJS</option>
                                      <option value="Umum">Umum</option>
                                      <option value="Keringanan (Cost Sharing)">Keringanan (Cost Sharing)</option>
                                    </select>
                                  </div>
                                  {patientFormData.paymentStatus === 'BPJS' && (
                                    <div className="space-y-2">
                                      <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Jenis JKN</label>
                                      <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.jknType} onChange={e => setPatientFormData({...patientFormData, jknType: e.target.value})}>
                                        <option value="PBI (APBD)">PBI (APBD)</option>
                                        <option value="PBI (Provinsi)">PBI (Provinsi)</option>
                                        <option value="PBI (APBN)">PBI (APBN)</option>
                                        <option value="Mandiri">Mandiri</option>
                                        <option value="PPU">PPU</option>
                                      </select>
                                    </div>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Status Keluar</label>
                                    <select className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" value={patientFormData.status} onChange={e => setPatientFormData({...patientFormData, status: e.target.value})}>
                                      <option value="Dirawat /Inap">Dirawat /Inap</option>
                                      <option value="BLPL">BLPL</option>
                                      <option value="APS">APS</option>
                                      <option value="Pindah Ruangan">Pindah Ruangan</option>
                                      <option value="Rujuk">Rujuk</option>
                                      <option value="Meninggal">Meninggal</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase ml-1">Keterangan Lain</label>
                                    <input className="w-full bg-slate-50 focus:bg-white rounded-2xl py-4 px-5 text-sm font-bold border border-slate-200 outline-none focus:border-indigo-500" placeholder="Catatan" value={patientFormData.notes} onChange={e => setPatientFormData({...patientFormData, notes: e.target.value})} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Button Submit Form Pasien */}
                      <div className="mt-8 pt-6 border-t border-slate-200 flex justify-end">
                        <button 
                          type="submit" 
                          disabled={isSaving} 
                          className="px-10 py-4 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-3 transition-all hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-1 active:scale-95 min-w-[200px]"
                        >
                            {isSaving ? (
                              <><Loader2 size={18} className="animate-spin" /> Menyimpan...</>
                            ) : (
                              <><CheckCircle size={18} /> {editingPatient ? 'Perbarui Data' : 'Simpan Data'}</>
                            )}
                        </button>
                      </div>
                    </form>
                </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default App;
