import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  BarChart3, 
  Upload, 
  Settings, 
  Trophy, 
  History, 
  ShieldCheck, 
  ChevronRight, 
  X,
  FileSearch,
  Zap,
  ArrowUpCircle,
  ArrowDownCircle,
  CircleDashed,
  User,
  LayoutDashboard,
  Lock,
  LogOut,
  Users,
  Key,
  Trash2,
  Clock,
  ExternalLink
} from "lucide-react";
import { analyzeChartImage, AnalysisResult } from "./services/geminiService";
import { db, auth } from "./lib/firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  onSnapshot
} from "firebase/firestore";
import { 
  signInAnonymously, 
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { format, addDays, isAfter } from "date-fns";

const googleProvider = new GoogleAuthProvider();

// --- Types ---
type AppView = "login" | "dashboard" | "analyzer" | "leaderboard" | "refund" | "admin";

interface UserProfile {
  userId: string;
  id: string;
  role: "admin" | "user";
  expiryDate: string;
  status: "active" | "disabled";
}

interface UserData {
  balance: number;
  id: string;
  equity: number;
}

// --- Components ---

const NeonGlow = () => (
  <div className="fixed inset-0 pointer-events-none z-0">
    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/20 blur-[120px] rounded-full" />
    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/20 blur-[120px] rounded-full" />
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-full border-[1px] border-white/5 pointer-events-none" />
  </div>
);

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-zinc-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 ${className}`}>
    {children}
  </div>
);

export default function App() {
  const [view, setView] = useState<AppView>("login");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [activeKeys, setActiveKeys] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminIdInput, setAdminIdInput] = useState("");
  const [adminPassInput, setAdminPassInput] = useState("");
  const [customKeyName, setCustomKeyName] = useState("");
  const [keyNote, setKeyNote] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [salesPrice, setSalesPrice] = useState("");
  const [genDuration, setGenDuration] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data() as UserProfile;
          if (profile.status === "disabled") {
            setAuthError("Your account has been disabled. Contact admin.");
            signOut(auth);
            setView("login");
          } else if (isAfter(new Date(), new Date(profile.expiryDate))) {
            setAuthError("Your access has expired. Contact admin for refill.");
            setView("login");
          } else {
            setUserProfile(profile);
            // Only auto-redirect to dashboard if we are at login and it's NOT an admin login in progress
            setView(prev => {
              if (prev === "login") {
                return profile.role === "admin" ? "admin" : "dashboard";
              }
              return prev;
            });
          }
        } else {
          setView("login");
        }
      } else {
        setView("login");
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    
    try {
      const q = query(collection(db, "accessKeys"), where("key", "==", accessKey), where("isUsed", "==", false));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setAuthError("Invalid or used access key. Please contact Admin.");
        return;
      }

      const keyDoc = querySnapshot.docs[0];
      const keyData = keyDoc.data();
      
      const userCred = await signInWithPopup(auth, googleProvider);
      const uid = userCred.user.uid;
      
      const expiry = addDays(new Date(), keyData.durationDays).toISOString();
      const newProfile: UserProfile = {
        userId: uid,
        id: Math.floor(Math.random() * 100000000).toString(),
        role: "user",
        expiryDate: expiry,
        status: "active"
      };

      await setDoc(doc(db, "users", uid), newProfile);
      await updateDoc(doc(db, "accessKeys", keyDoc.id), { isUsed: true, usedBy: uid });
      
      setUserProfile(newProfile);
      setView("dashboard");
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('popup-closed-by-user')) {
        setAuthError("লগইন উইন্ডো বন্ধ হয়ে গেছে। আবার চেষ্টা করুন।");
      } else {
        setAuthError("লগইন করতে সমস্যা হয়েছে। দয়া করে গুগল লগইন সম্পন্ন করুন।");
      }
    }
  };

  const handleAdminPanel = async () => {
    const pass = prompt("Enter Admin Password:");
    if (pass === "191919") {
      setView("admin");
      try {
        const userSnap = await getDocs(collection(db, "users"));
        setAdminUsers(userSnap.docs.map(d => d.data() as UserProfile));
        const keySnap = await getDocs(collection(db, "accessKeys"));
        setActiveKeys(keySnap.docs.map(d => d.data()));
      } catch (err) {
        console.error("Admin bypass fetch failed:", err);
      }
    }
  };

  const deleteUser = async (uid: string) => {
    if (confirm("Permanently remove this user?")) {
      await deleteDoc(doc(db, "users", uid));
    }
  };

  const generateKey = async () => {
    try {
      const keyToUse = customKeyName.trim() || `FX-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      await setDoc(doc(db, "accessKeys", keyToUse), {
        key: keyToUse,
        durationDays: genDuration,
        isUsed: false,
        note: keyNote.trim(),
        customerPhone: customerPhone.trim(),
        price: salesPrice.trim(),
        createdAt: new Date().toISOString()
      });
      alert(`সফলভাবে কি তৈরি হয়েছে: ${keyToUse}`);
      setCustomKeyName("");
      setKeyNote("");
      setCustomerPhone("");
      setSalesPrice("");
      // Refresh list
      const keySnap = await getDocs(collection(db, "accessKeys"));
      setActiveKeys(keySnap.docs.map(d => d.data()));
    } catch (err) {
      console.error(err);
      alert("কি তৈরি করতে ব্যর্থ হয়েছে। ফায়ারবেস পারমিশন চেক করুন।");
    }
  };

  const deleteKey = async (keyId: string) => {
    if (confirm("এই কি-টি ডিলিট করতে চান?")) {
      await deleteDoc(doc(db, "accessKeys", keyId));
      setActiveKeys(prev => prev.filter(k => k.key !== keyId));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisError(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = (reader.result as string).split(",")[1];
      try {
        const result = await analyzeChartImage(base64String);
        setAnalysisResult(result);
      } catch (err: any) {
        console.error(err);
        setAnalysisError(err.message || "বিশ্লেষণ ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-pink-500/30 overflow-x-hidden">
      <NeonGlow />
      
      {/* Header */}
      <header className="sticky top-0 z-50 px-4 py-6 border-b border-white/5 bg-black/50 backdrop-blur-md flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(236,72,153,0.5)]">
            <BarChart3 className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">FX ANALYSER</h1>
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Vision Engine v2.4</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-zinc-400 font-medium">Balance</p>
            <p className="text-sm font-bold text-emerald-400">$1,450.50</p>
          </div>
          <button onClick={handleAdminPanel} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
            <Settings className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
      </header>

      <main className="relative z-10 px-4 pb-24 pt-6 max-w-lg mx-auto">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <CircleDashed className="w-10 h-10 animate-spin text-pink-500" />
            </div>
          ) : view === "login" ? (
            <motion.div
              key="login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6 py-6"
            >
              <div className="text-center space-y-2">
                <div className="w-20 h-20 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xl mb-4">
                  <Lock className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-black tracking-tight">এক্সেস লক করা আছে</h2>
                <p className="text-zinc-500 max-w-[280px] mx-auto">AI ভিশন ইঞ্জিন আনলক করতে আপনার ভিআইপি এক্সেস কি প্রদান করুন।</p>
              </div>

              {/* User Login Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <input 
                    type="text" 
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    placeholder="এক্সেস কি লিখুন (যেমন: FX-XXXX)"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-center text-xl font-mono focus:outline-none focus:border-pink-500 transition-all uppercase"
                    required
                  />
                  {authError && !accessKey.toLowerCase().includes('admin') && <p className="text-red-400 text-sm text-center font-bold px-4">{authError}</p>}
                </div>
                <button 
                  type="submit"
                  className="w-full py-4 bg-pink-600 rounded-2xl font-black text-lg hover:bg-pink-500 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)]"
                >
                  আনলক করুন
                </button>
              </form>

              {/* Advertisement Space */}
              <Card className="bg-gradient-to-r from-zinc-900 to-black border-white/5 py-8 text-center border-dashed border-2">
                <p className="text-zinc-600 font-bold uppercase tracking-widest text-[10px]">Your Advertisement Space</p>
                <p className="text-zinc-700 text-xs mt-1">Contact for promotions</p>
              </Card>

              {/* Support Links */}
              <div className="text-center">
                <p className="text-xs text-zinc-500 mb-2">আপনার কাছে চাবি নেই? আমাদের অফিশিয়াল সাপোর্ট এ যোগাযোগ করুন।</p>
                <a href="https://t.me/darksite1T0" className="text-white bg-zinc-800 px-4 py-2 rounded-full text-xs font-bold hover:bg-zinc-700 transition-all inline-flex items-center gap-1 border border-white/5">
                  @FX_AI_SUPPORT <ExternalLink size={10} />
                </a>
              </div>

              {/* Admin Secure Gate */}
              <div className="mt-12 pt-8 border-t border-white/5">
                <div className="bg-zinc-900/50 p-6 rounded-3xl border border-white/5">
                  <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] text-center mb-6">Staff Control Gate</h3>
                  <div className="space-y-4">
                    <input 
                      type="text" 
                      placeholder="অ্যাডমিন আইডি"
                      value={adminIdInput}
                      onChange={(e) => setAdminIdInput(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-pink-500 outline-none transition-all"
                    />
                    <input 
                      type="password" 
                      placeholder="পাসওয়ার্ড"
                      value={adminPassInput}
                      onChange={(e) => setAdminPassInput(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-pink-500 outline-none transition-all"
                    />
                    <button 
                      onClick={async () => {
                        if (adminIdInput.toLowerCase() === 'admin' && adminPassInput === '191919') {
                           try {
                            console.log("Admin password correct. Forcing view...");
                            setView("admin");
                            
                            // Load data if possible
                            getDocs(collection(db, "users")).then(snapshot => {
                              setAdminUsers(snapshot.docs.map(d => d.data() as UserProfile));
                            }).catch(() => console.log("Login required for full data access."));

                            // Attempt background auth
                            const userCred = await signInWithPopup(auth, googleProvider).catch(e => {
                              console.warn("Popup blocked, using UI bypass", e);
                              alert("নোট: পপআপ ব্লক হওয়ার কারণে লগইন হয়নি। অ্যাডমিন প্যানেল দেখা যাচ্ছে, কিন্তু কিছু ফিচার কাজ নাও করতে পারে। পপআপ এলাউ করুন।");
                              return null;
                            });

                            if (userCred) {
                              const uid = userCred.user.uid;
                              const adminProfile: UserProfile = {
                                userId: uid,
                                id: "ADMIN-ROOT",
                                role: "admin",
                                expiryDate: addDays(new Date(), 3650).toISOString(),
                                status: "active"
                              };
                              await setDoc(doc(db, "users", uid), adminProfile);
                              setUserProfile(adminProfile);
                              const snapshot = await getDocs(collection(db, "users"));
                              setAdminUsers(snapshot.docs.map(d => d.data() as UserProfile));
                            }
                          } catch (err: any) { 
                            console.error("Admin Login Error:", err);
                          }
                        } else {
                          alert("ভুল আইডি বা পাসওয়ার্ড!");
                        }
                      }}
                      className="w-full py-3 bg-pink-600 rounded-xl text-xs font-bold border border-white/10 hover:bg-pink-500 transition-all text-white shadow-lg"
                    >
                      ভেরিফাই এবং অ্যাডমিন প্যানেলে প্রবেশ করুন
                    </button>
                    <p className="text-[10px] text-zinc-500 text-center mt-2">নোট: পপআপ ব্লক থাকলে ভিউ বাইপাস ব্যবহার হবে।</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : view === "dashboard" && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Main Menu */}
              <div className="grid grid-cols-2 gap-4">
                <MenuButton 
                  icon={<FileSearch className="w-6 h-6" />}
                  label="AI Analyser"
                  sub="Pro Vision"
                  onClick={() => setView("analyzer")}
                  color="from-pink-500 to-purple-600"
                />
                <MenuButton 
                  icon={<Trophy className="w-6 h-6" />}
                  label="Leaderboard"
                  sub="Top Traders"
                  onClick={() => setView("leaderboard")}
                  color="from-amber-400 to-orange-500"
                />
                <MenuButton 
                  icon={<ShieldCheck className="w-6 h-6" />}
                  label="Refund Claim"
                  sub="System Online"
                  onClick={() => setView("refund")}
                  color="from-blue-500 to-cyan-400"
                />
                <MenuButton 
                  icon={<LayoutDashboard className="w-6 h-6" />}
                  label="History"
                  sub="Signal Log"
                  onClick={() => {}}
                  color="from-zinc-700 to-zinc-800"
                />
              </div>

              {/* AI Voicer Section */}
              <Card className="bg-gradient-to-br from-zinc-800 to-zinc-900 border-zinc-700/50">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-purple-400" />
                    <h2 className="text-sm font-bold uppercase tracking-wider">AI Voicer PRO</h2>
                  </div>
                  <div className="flex gap-1">
                    <div className="w-1 h-3 bg-pink-500 animate-pulse" />
                    <div className="w-1 h-3 bg-pink-500 animate-pulse delay-75" />
                    <div className="w-1 h-3 bg-pink-500 animate-pulse delay-150" />
                  </div>
                </div>
                <div className="bg-black/40 rounded-xl p-4 flex items-center justify-center gap-4 border border-white/5">
                  <div className="w-10 h-10 rounded-full border-2 border-pink-500/50 flex items-center justify-center">
                    <div className="w-6 h-6 bg-pink-500 rounded-full animate-ping opacity-20" />
                    <Zap className="w-4 h-4 text-pink-500 absolute fill-pink-500" />
                  </div>
                  <p className="text-xs text-zinc-400 font-medium tracking-tight">Awaiting voice command for manual analysis...</p>
                </div>
              </Card>

              {/* Status Section */}
              <Card className="border-pink-500/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-pink-500 fill-pink-500" />
                    <h2 className="text-sm font-bold uppercase tracking-wider">Live Market Status</h2>
                  </div>
                  <div className="px-2 py-0.5 rounded-full bg-pink-500/10 border border-pink-500/20 text-[10px] text-pink-500 font-bold uppercase">
                    Bullish
                  </div>
                </div>
                <div className="flex justify-between items-end h-20 gap-1">
                  {[40, 70, 45, 90, 65, 30, 85, 55, 95, 40, 60, 80, 50, 70, 40].map((h, i) => (
                    <motion.div 
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      className={`w-full rounded-sm ${h > 60 ? 'bg-emerald-500/50' : 'bg-red-500/50'}`}
                      transition={{ delay: i * 0.05 }}
                    />
                  ))}
                </div>
              </Card>

              {/* Promo Banner */}
              <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-r from-purple-900/40 to-pink-900/40 border border-white/5 mt-6">
                <div className="relative z-10">
                  <h3 className="font-bold text-lg mb-1">Upgrade to Premium</h3>
                  <p className="text-sm text-zinc-300">Get 100% accurate AI signals and unlimited chart uploads.</p>
                </div>
                <div className="absolute right-[-20px] bottom-[-20px] opacity-10">
                  <BarChart3 size={120} />
                </div>
              </div>
            </motion.div>
          )}

          {view === "analyzer" && (
            <motion.div 
              key="analyzer"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setView("dashboard")} className="p-2 bg-white/5 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">AI Vision Analyser</h2>
              </div>

              {!analysisResult ? (
                <Card className={`text-center py-12 border-dashed border-2 ${analysisError ? 'border-red-500/50' : 'border-white/10'}`}>
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept="image/*"
                  />
                  {isAnalyzing ? (
                    <div className="relative py-8 overflow-hidden flex flex-col items-center justify-center">
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="relative w-40 h-40 mb-6"
                      >
                        <div className="absolute inset-0 rounded-full border-2 border-pink-500/10 animate-ping" />
                        <div className="absolute inset-0 rounded-full border border-pink-500/20" />
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-2 border-t-2 border-l-2 border-pink-500 rounded-full shadow-[0_0_15px_rgba(236,72,153,0.3)]"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                            <Zap className="w-10 h-10 text-pink-500 fill-pink-500/20" />
                          </motion.div>
                        </div>
                      </motion.div>
                      <div className="space-y-3">
                        <motion.p animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1 }} className="text-sm font-black tracking-[0.3em] text-pink-500 uppercase">AI Scanning Chart...</motion.p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        {analysisError ? <X className="w-8 h-8 text-red-500" /> : <Upload className="w-8 h-8 text-zinc-400" />}
                      </div>
                      <div>
                        <p className={`text-lg font-bold ${analysisError ? 'text-red-500' : ''}`}>
                          {analysisError ? 'বিশ্লেষণ ব্যর্থ হয়েছে' : 'Upload Training Chart'}
                        </p>
                        <p className="text-sm text-zinc-400 px-8">
                          {analysisError ? analysisError : 'Take a screenshot of your chart and upload here.'}
                        </p>
                      </div>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className={`${analysisError ? 'bg-red-600 text-white' : 'bg-white text-black'} font-bold py-3 px-8 rounded-xl hover:opacity-90 transition-all`}
                      >
                        {analysisError ? 'আবার চেষ্টা করুন' : 'Select Screenshot'}
                      </button>
                    </div>
                  )}
                </Card>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", damping: 25, stiffness: 120 }}
                  className="space-y-6"
                >
                  <Card className="border-pink-500/50 shadow-[0_0_20px_rgba(236,72,153,0.2)]">
                    <div className="flex gap-2 mb-4">
                      <div className="px-2 py-1 bg-pink-500/10 rounded-md border border-pink-500/20 text-[10px] font-black text-pink-500 uppercase tracking-tighter">
                        Candle: {analysisResult.candleTime || "Auto"}
                      </div>
                      <div className="px-2 py-1 bg-white/5 rounded-md border border-white/10 text-[10px] font-bold text-zinc-500">
                        Signal: {new Date().toLocaleTimeString()}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-xs text-zinc-400 uppercase font-bold tracking-widest mb-1">Signal Direction</p>
                        <div className={`text-3xl font-black flex items-center gap-2 ${
                          analysisResult.prediction === "UP" ? "text-emerald-400" : analysisResult.prediction === "DOWN" ? "text-red-400" : "text-zinc-400"
                        }`}>
                          {analysisResult.prediction === "UP" ? <ArrowUpCircle className="w-8 h-8" /> : analysisResult.prediction === "DOWN" ? <ArrowDownCircle className="w-8 h-8" /> : null}
                          {analysisResult.prediction}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-400 uppercase font-bold tracking-widest mb-1">Confidence</p>
                        <p className="text-2xl font-black text-white">{analysisResult.confidence}%</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(analysisResult.timeframeResults).map(([tf, res]) => (
                        <div key={tf} className="bg-white/5 p-2 rounded-lg border border-white/5 text-center">
                          <p className="text-[10px] text-zinc-400 font-bold uppercase mb-1">{tf}</p>
                          <p className={`text-sm font-black ${res === "UP" ? "text-emerald-400" : res === "DOWN" ? "text-red-400" : "text-zinc-400"}`}>
                            {res}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card>
                    <h3 className="font-bold border-b border-white/5 pb-2 mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-blue-500" />
                      Technical Indicators
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-[11px] gap-4">
                        <span className="text-zinc-500 uppercase font-bold">Moving Average</span>
                        <span className="text-white bg-white/5 px-2 py-1 rounded border border-white/5 text-right truncate max-w-[150px]">
                          {analysisResult.indicators.movingAverage || "Searching..."}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] gap-4">
                        <span className="text-zinc-500 uppercase font-bold">RSI (14)</span>
                        <span className={`px-2 py-1 rounded border text-right truncate max-w-[150px] ${
                          analysisResult.indicators.rsi?.toLowerCase().includes('oversold') 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : analysisResult.indicators.rsi?.toLowerCase().includes('overbought') 
                              ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                              : 'bg-white/5 border-white/5 text-white'
                        }`}>
                          {analysisResult.indicators.rsi || "Searching..."}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] gap-4">
                        <span className="text-zinc-500 uppercase font-bold">MACD</span>
                        <span className="text-white bg-white/5 px-2 py-1 rounded border border-white/5 text-right truncate max-w-[150px]">
                          {analysisResult.indicators.macd || "Searching..."}
                        </span>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <h3 className="font-bold border-b border-white/5 pb-2 mb-3 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      Patterns Identified
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {analysisResult.patterns.map((p, i) => (
                        <span key={i} className="px-3 py-1 bg-white/5 rounded-full text-xs font-medium border border-white/5">
                          {p}
                        </span>
                      ))}
                    </div>
                  </Card>

                  <Card className="bg-pink-500/5 border-pink-500/20">
                    <h3 className="font-bold mb-2 text-sm uppercase tracking-widest text-pink-500">Technical Analysis</h3>
                    <p className="text-sm text-zinc-300 leading-relaxed italic">
                      "{analysisResult.reasoning}"
                    </p>
                  </Card>

                  <button 
                    onClick={() => setAnalysisResult(null)}
                    className="w-full py-4 bg-zinc-800 rounded-xl font-bold hover:bg-zinc-700 transition-colors"
                  >
                    Analyse New Chart
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === "leaderboard" && (
            <motion.div 
              key="leaderboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setView("dashboard")} className="p-2 bg-white/5 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">Leaderboard</h2>
              </div>

              {[
                { name: "Zidan_ex", profit: 2450.00, rank: 1, avatar: "Z" },
                { name: "Sina_Trader", profit: 2120.50, rank: 2, avatar: "S" },
                { name: "Al-Amin_FX", profit: 1890.30, rank: 3, avatar: "A" },
                { name: "Ghost_Trader", profit: 1540.00, rank: 4, avatar: "G" },
                { name: "Noob_King", profit: 1200.00, rank: 5, avatar: "N" },
              ].map((trader) => (
                <div key={trader.rank} className="p-4 bg-white/5 rounded-2xl flex items-center justify-between border border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center font-bold text-zinc-400">
                      {trader.avatar}
                    </div>
                    <div>
                      <p className="font-bold">{trader.name}</p>
                      <p className="text-xs text-zinc-500">Rank #{trader.rank}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-400 font-black">+${trader.profit.toFixed(2)}</p>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold">Profit Today</p>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {view === "refund" && (
            <motion.div 
              key="refund"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setView("dashboard")} className="p-2 bg-white/5 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">Balance Refund Claim</h2>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex gap-3 text-blue-400">
                <ShieldCheck className="w-6 h-6 shrink-0" />
                <p className="text-xs leading-relaxed">
                  Lost funds on Quotex? Use our official AI system to claim a refund of up to 60% of your total loss. Strictly requires a verified account.
                </p>
              </div>

              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert("Claim Submitted Successfully. Review in progress."); setView("dashboard"); }}>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Quotex ID / UID</label>
                  <input 
                    type="text" 
                    placeholder="e.g. 12345678"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Loss Amount ($)</label>
                  <input 
                    type="number" 
                    placeholder="Min. $500"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Promo Code (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="ENTER VIP PROMO"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-600 rounded-xl font-bold hover:bg-blue-500 transition-colors shadow-[0_0_20px_rgba(37,99,235,0.3)] mt-4"
                >
                  Submit Claim
                </button>
              </form>
            </motion.div>
          )}

          {view === "admin" && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setView("dashboard")} className="p-2 bg-white/5 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold">Admin Panel</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-center">
                  <p className="text-2xl font-black">{adminUsers.length}</p>
                  <p className="text-[10px] text-zinc-500 uppercase font-bold">Total Users</p>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-center">
                  <p className="text-2xl font-black">{adminUsers.filter(u => isAfter(new Date(u.expiryDate), new Date())).length}</p>
                  <p className="text-[10px] text-zinc-500 uppercase font-bold">Active Members</p>
                </div>
              </div>

              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-pink-500" />
                    Manage Users ({adminUsers.length})
                  </h3>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {adminUsers.map(u => (
                    <div key={u.userId} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                      <div>
                        <p className="text-sm font-bold">UID: {u.id}</p>
                        <p className="text-[10px] text-zinc-500">Expires: {format(new Date(u.expiryDate), 'dd MMM yyyy')}</p>
                      </div>
                      <div className="flex gap-2">
                         <button 
                          onClick={() => deleteUser(u.userId)}
                          className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-500" />
                  Key Generator
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold px-1">কি-র নাম (ঐচ্ছিক)</p>
                    <input 
                      type="text" 
                      placeholder="যেমন: VIP-KEY-999"
                      value={customKeyName}
                      onChange={(e) => setCustomKeyName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-pink-500 outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold px-1">নোট / গ্রাহকের নাম</p>
                    <input 
                      type="text" 
                      placeholder="যেমন: ইমরান সাহেবের জন্য"
                      value={keyNote}
                      onChange={(e) => setKeyNote(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-pink-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold px-1">মোবাইল নম্বর</p>
                      <input 
                        type="text" 
                        placeholder="017xxxxxxxx"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-pink-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold px-1">টাকার পরিমাণ</p>
                      <input 
                        type="text" 
                        placeholder="৳৫০০"
                        value={salesPrice}
                        onChange={(e) => setSalesPrice(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-pink-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold px-1">মেয়াদ নির্বাচন করুন</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: '১ দিন', val: 1 },
                        { label: '৭ দিন', val: 7 },
                        { label: '৩০ দিন', val: 30 },
                        { label: '১ বছর', val: 365 }
                      ].map(d => (
                        <button 
                          key={d.val}
                          onClick={() => setGenDuration(d.val)}
                          className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${
                            genDuration === d.val ? 'bg-pink-600 border-pink-500 text-white' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={generateKey}
                    className="w-full py-3 bg-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                  >
                    <Zap size={14} className="fill-white" />
                    তৈরি করুন (Generate)
                  </button>
                </div>
              </Card>

              <Card>
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-500" />
                  Active Unused Keys ({activeKeys.filter(k => !k.isUsed).length})
                </h3>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                  {activeKeys.filter(k => !k.isUsed).map(k => (
                    <div key={k.key} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="overflow-hidden">
                        <p className="text-sm font-mono font-bold text-pink-500 truncate">{k.key}</p>
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                          <p className="text-[10px] text-zinc-500 whitespace-nowrap">{k.durationDays} Days</p>
                          {k.price && <p className="text-[10px] text-emerald-500 font-bold whitespace-nowrap">৳{k.price}</p>}
                          {k.note && <p className="text-[10px] text-zinc-400 italic truncate max-w-[80px]"> - {k.note}</p>}
                          {k.customerPhone && <p className="text-[10px] text-zinc-500 font-mono">{k.customerPhone}</p>}
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteKey(k.key)}
                        className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 shrink-0 ml-2"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {activeKeys.filter(k => !k.isUsed).length === 0 && (
                    <p className="text-center text-xs text-zinc-600 py-4 italic">কোন কি নেই। উপরে থেকে জেনারেট করুন।</p>
                  )}
                </div>
              </Card>

              <button className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors">
                Save Changes
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation Footer */}
      {view !== "login" && (
        <nav className="fixed bottom-0 w-full bg-black/80 backdrop-blur-xl border-t border-white/5 px-6 py-4 flex justify-between items-center z-50 max-w-lg mx-auto left-1/2 -translate-x-1/2">
          <NavIcon icon={<LayoutDashboard />} active={view === "dashboard"} onClick={() => setView("dashboard")} />
          <NavIcon icon={<FileSearch />} active={view === "analyzer"} onClick={() => setView("analyzer")} />
          <div 
            onClick={() => setView("analyzer")}
            className="w-14 h-14 bg-pink-600 rounded-full flex items-center justify-center -translate-y-6 shadow-[0_0_20px_rgba(236,72,153,0.5)] border-4 border-black cursor-pointer hover:bg-pink-500 transition-all active:scale-95"
          >
            <Zap className="text-white w-6 h-6 fill-white" />
          </div>
          <NavIcon icon={<Trophy />} active={view === "leaderboard"} onClick={() => setView("leaderboard")} />
          <NavIcon icon={<LogOut />} active={false} onClick={() => signOut(auth)} />
        </nav>
      )}
    </div>
  );
}

function MenuButton({ icon, label, sub, onClick, color }: { icon: React.ReactNode, label: string, sub: string, onClick: () => void, color: string }) {
  return (
    <button 
      onClick={onClick}
      className="relative group overflow-hidden rounded-2xl p-4 bg-zinc-900 border border-white/5 flex flex-col items-start gap-3 hover:border-white/20 transition-all active:scale-95 text-left"
    >
      <div className={`p-2 rounded-lg bg-gradient-to-br ${color} shadow-lg`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold">{label}</p>
        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-tight">{sub}</p>
      </div>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-4 h-4 text-zinc-500" />
      </div>
    </button>
  );
}

function NavIcon({ icon, active, onClick }: { icon: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`p-2 transition-all ${active ? 'text-pink-500 scale-110' : 'text-zinc-500 hover:text-zinc-300'}`}>
      {icon}
    </button>
  );
}
