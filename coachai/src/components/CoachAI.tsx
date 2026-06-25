import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UserStats, Message, UserType, ActiveTab, Workout } from "../types";
import { 
  Send, User as UserIcon, Bot, Crown, Zap, Activity, 
  LayoutDashboard, MessageSquare, Dumbbell, Apple, Settings, 
  Plus, TrendingUp, Clock, Flame, ChevronRight, AlertCircle, ShoppingCart, Target, Star, Package,
  ArrowRight, Check, Pencil, CheckCircle2, Trophy, Database, RefreshCw, ExternalLink, LogOut, FileText,
  X, Upload, Trash2, Camera, FileImage
} from "lucide-react";
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getCoachResponse, analyzeWorkout } from "../services/geminiService";
import Onboarding from "./Onboarding";
import Pricing from "./Pricing";
import Logo from "./Logo";

import { User } from "firebase/auth";
import { 
  initAuth, 
  googleSignIn, 
  logout, 
  createGoogleSpreadsheet, 
  syncDataToGoogleSpreadsheet,
  extractSpreadsheetId,
  fetchSpreadsheetData,
  enviarDatosAdmin
} from "../services/googleSheetsService";
import {
  getUserStatsFirestore,
  saveUserStatsFirestore,
  getUserMessagesFirestore,
  saveMessageFirestore,
  clearUserMessagesFirestore
} from "../services/firebase";

export default function CoachAI() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('landing');
  const [userStats, setUserStats] = useState<UserStats>({
    xp: 450,
    level: 1,
    streak: 12,
    tier: 'FREE',
    isOnboarded: false,
    trialStartDate: Date.now(),
    subscriptionType: 'NONE',
    goal: 'Mejorar mi rendimiento físico',
    weight: 75,
    dailyCalories: 2500,
    workouts: [],
    profile: {
      sport: 'Gym / Pesas',
      frequency: '3-4 veces/sem'
    },
    device: {
      hasDevice: false,
      isConnected: false,
      primaryMetrics: ['Pasos', 'Frecuencia Cardíaca'],
      brand: 'Ninguno',
      model: '',
      useDaily: true
    },
    training: {
      frequency: '3-4 veces/sem',
      type: 'Gym / Pesas',
      routineSource: 'manual'
    },
    sleepHours: 7.5,
    fatigueLevel: 'Baja',
    linkedSheetId: '1eo8GKcWVM2oTDNOeEqrGevsbrUb77dPZqTZLIW7MXn4',
    linkedSheetUrl: 'https://docs.google.com/spreadsheets/d/1eo8GKcWVM2oTDNOeEqrGevsbrUb77dPZqTZLIW7MXn4/edit?gid=967289731#gid=967289731'
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Custom sheets linking & import states
  const [customSheetUrl, setCustomSheetUrl] = useState("https://docs.google.com/spreadsheets/d/1eo8GKcWVM2oTDNOeEqrGevsbrUb77dPZqTZLIW7MXn4/edit?gid=967289731#gid=967289731");
  const [importedHeaders, setImportedHeaders] = useState<string[]>([]);
  const [importedRows, setImportedRows] = useState<any[][]>([]);
  const [isFetchingCustomSheet, setIsFetchingCustomSheet] = useState(false);
  const [selectedSheetRowIndex, setSelectedSheetRowIndex] = useState<number | null>(null);

  // Helper mapper for Google Form/Google Sheets спортсмен profiles
  const mapImportedRowToProfile = (headers: string[], row: any[]) => {
    const profile: any = {};
    let goal = 'Mejorar mi rendimiento físico';
    let weight = 75;
    let age = 25;
    let height = 175;
    let durationText = '1 hora';
    let restText = 'Regular';
    let nutritionText = 'Regular';
    let nameText = '';
    let hardText = '';

    headers.forEach((header, index) => {
      const val = row[index]?.toString()?.trim() || '';
      if (!val) return;

      const lowerHeader = header.toLowerCase();
      
      if (lowerHeader.includes("deporte") || lowerHeader.includes("actividad")) {
        profile.sport = val;
      } else if (lowerHeader.includes("frecuencia")) {
        profile.frequency = val;
      } else if (lowerHeader.includes("dura") || lowerHeader.includes("duración")) {
        durationText = val;
      } else if (lowerHeader.includes("descanso")) {
        restText = val;
      } else if (lowerHeader.includes("alimentación") || lowerHeader.includes("nutrición")) {
        nutritionText = val;
      } else if (lowerHeader.includes("objetivo")) {
        goal = val;
      } else if (lowerHeader.includes("cuesta") || lowerHeader.includes("dificultad") || lowerHeader.includes("más te cuesta")) {
        hardText = val;
        profile.hardParts = val.split(',').map((s: string) => s.trim());
      } else if (lowerHeader.includes("edad")) {
        const parsedAge = parseInt(val, 10);
        if (!isNaN(parsedAge)) age = parsedAge;
      } else if (lowerHeader.includes("peso")) {
        const parsedWeight = parseFloat(val);
        if (!isNaN(parsedWeight)) weight = parsedWeight;
      } else if (lowerHeader.includes("altura") || lowerHeader.includes("estatura")) {
        const parsedHeight = parseFloat(val);
        if (!isNaN(parsedHeight)) {
          if (parsedHeight < 3.0) {
            height = Math.round(parsedHeight * 100);
          } else {
            height = Math.round(parsedHeight);
          }
        }
      } else if (lowerHeader.includes("nombre")) {
        nameText = val;
      }
    });

    profile.age = age;
    profile.height = height;

    return {
      profile,
      goal,
      weight,
      durationText,
      restText,
      nutritionText,
      nameText,
      hardText
    };
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(prev => prev === msg ? null : prev);
    }, 4500);
  };

  useEffect(() => {
    const unsubscribe = initAuth(
      async (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        try {
          const savedStats = await getUserStatsFirestore(user.uid);
          if (savedStats) {
            setUserStats({
              ...savedStats,
              linkedSheetId: savedStats.linkedSheetId || '1eo8GKcWVM2oTDNOeEqrGevsbrUb77dPZqTZLIW7MXn4',
              linkedSheetUrl: savedStats.linkedSheetUrl || 'https://docs.google.com/spreadsheets/d/1eo8GKcWVM2oTDNOeEqrGevsbrUb77dPZqTZLIW7MXn4/edit?gid=967289731#gid=967289731'
            });
          } else {
            await saveUserStatsFirestore(user.uid, userStats);
          }
          const savedMsgs = await getUserMessagesFirestore(user.uid);
          if (savedMsgs && savedMsgs.length > 0) {
            setMessages(savedMsgs);
          }
          setIsInitialLoadComplete(true);
          showToast("¡Perfil sincronizado con Firestore!");
        } catch (err) {
          console.error("Error loading user profile on auth change:", err);
          setIsInitialLoadComplete(true);
        }
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
        setIsInitialLoadComplete(false);
      }
    );
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  // Synchronize stats changes back to Firestore
  useEffect(() => {
    if (googleUser && isInitialLoadComplete && userStats) {
      saveUserStatsFirestore(googleUser.uid, userStats).catch(err => {
        console.error("Error backing up userStats to Firestore:", err);
      });
    }
  }, [googleUser, isInitialLoadComplete, userStats]);

  const handleConnectSheets = async () => {
    try {
      setIsSyncingSheets(true);
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        
        try {
          const savedStats = await getUserStatsFirestore(res.user.uid);
          if (savedStats) {
            setUserStats({
              ...savedStats,
              linkedSheetId: savedStats.linkedSheetId || '1eo8GKcWVM2oTDNOeEqrGevsbrUb77dPZqTZLIW7MXn4',
              linkedSheetUrl: savedStats.linkedSheetUrl || 'https://docs.google.com/spreadsheets/d/1eo8GKcWVM2oTDNOeEqrGevsbrUb77dPZqTZLIW7MXn4/edit?gid=967289731#gid=967289731'
            });
          } else {
            await saveUserStatsFirestore(res.user.uid, userStats);
          }
          const savedMsgs = await getUserMessagesFirestore(res.user.uid);
          if (savedMsgs && savedMsgs.length > 0) {
            setMessages(savedMsgs);
          }
          setIsInitialLoadComplete(true);
          showToast("¡Cuenta vinculada con Cloud Firestore!");
        } catch (err) {
          console.error("Error loading user profile on connect:", err);
          setIsInitialLoadComplete(true);
        }
      }
    } catch (error: any) {
      console.error(error);
      showToast("Error al conectar con Google: " + error.message);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleCreateAndLinkSheet = async () => {
    if (!googleToken) {
      alert("Por favor conecta primero tu cuenta de Google.");
      return;
    }
    try {
      setIsSyncingSheets(true);
      const result = await createGoogleSpreadsheet(googleToken, userStats);
      setUserStats(prev => ({
        ...prev,
        linkedSheetId: result.spreadsheetId,
        linkedSheetUrl: result.spreadsheetUrl,
        lastSyncTime: new Date().toLocaleString()
      }));
    } catch (error: any) {
      console.error(error);
      alert("Error al crear la planilla de Google Sheets: " + error.message);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleSyncSheets = async () => {
    try {
      setIsSyncingSheets(true);
      await enviarDatosAdmin("sincronizacion", {
        nombre: `${userStats.profile?.name || ""} ${userStats.profile?.lastName || ""}`.trim() || userStats.nombre || "Atleta",
        deporte: userStats.profile?.sport || "",
        frecuencia: userStats.profile?.frequency || "",
        objetivo: userStats.goal || "",
        edad: userStats.profile?.age || "",
        peso: userStats.weight || "",
        altura: userStats.profile?.height || "",
        nivel: userStats.level,
        xp: userStats.xp,
        racha: userStats.streak,
        plan: userStats.tier,
        suscripcion: userStats.subscriptionType,
        sueno: userStats.sleepHours !== undefined ? userStats.sleepHours : 7.5,
        sueño: userStats.sleepHours !== undefined ? userStats.sleepHours : 7.5,
        "sueño (h)": userStats.sleepHours !== undefined ? userStats.sleepHours : 7.5,
        "Sueño (h)": userStats.sleepHours !== undefined ? userStats.sleepHours : 7.5,
        sueno_h: userStats.sleepHours !== undefined ? userStats.sleepHours : 7.5,
        fatiga: userStats.fatigueLevel || "Baja",
        Fatiga: userStats.fatigueLevel || "Baja",
        fecha: new Date().toLocaleString()
      });
      setUserStats(prev => ({
        ...prev,
        lastSyncTime: new Date().toLocaleString()
      }));
      showToast("¡Métricas reportadas con éxito a la planilla general!");
    } catch (error: any) {
      console.error(error);
      alert("Error al reportar métricas a la planilla general: " + error.message);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleDisconnectSheets = async () => {
    try {
      setIsSyncingSheets(true);
      await logout();
      setGoogleUser(null);
      setGoogleToken(null);
      setIsInitialLoadComplete(false);
      setUserStats(prev => ({
        ...prev,
        linkedSheetId: undefined,
        linkedSheetUrl: undefined,
        lastSyncTime: undefined
      }));
      showToast("Sesión de Google desconectada.");
    } catch (error: any) {
      console.error(error);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleAnalyzeCustomSheet = async () => {
    if (!googleToken) {
      alert("Por favor, conecta primero tu cuenta de Google.");
      return;
    }
    if (!customSheetUrl.trim()) {
      alert("Por favor, ingresa una URL o ID de planilla válida.");
      return;
    }

    try {
      setIsFetchingCustomSheet(true);
      const sheetId = extractSpreadsheetId(customSheetUrl);
      console.log("Fetching custom spreadsheet: ", sheetId);
      
      const result = await fetchSpreadsheetData(googleToken, sheetId);
      if (result.headers.length === 0) {
        alert("La planilla parece estar vacía o no tiene el formato correcto.");
        return;
      }

      setImportedHeaders(result.headers);
      setImportedRows(result.rows);
      setSelectedSheetRowIndex(null);
      showToast("¡Planilla analizada con éxito!");
    } catch (error: any) {
      console.error(error);
      alert("Error al acceder a la planilla de Google. Verifica que la URL sea correcta y que tengas permisos de lectura en ella: " + error.message);
    } finally {
      setIsFetchingCustomSheet(false);
    }
  };

  const handleLinkSelectedRowProfile = async (rowIndex: number) => {
    if (rowIndex < 0 || rowIndex >= importedRows.length) return;
    if (!googleUser) {
      alert("Se requiere una cuenta de Google activa.");
      return;
    }
    const row = importedRows[rowIndex];
    const sheetId = extractSpreadsheetId(customSheetUrl);
    
    try {
      setIsSyncingSheets(true);
      
      const mapped = mapImportedRowToProfile(importedHeaders, row);
      
      const updatedStats: UserStats = {
        ...userStats,
        linkedSheetId: sheetId,
        linkedSheetUrl: customSheetUrl.startsWith("http") ? customSheetUrl : `https://docs.google.com/spreadsheets/d/${sheetId}`,
        lastSyncTime: new Date().toLocaleString(),
        isOnboarded: true,
        goal: mapped.goal,
        weight: mapped.weight,
        profile: {
          ...userStats.profile,
          ...mapped.profile,
          sport: mapped.profile.sport || userStats.profile.sport,
          frequency: mapped.profile.frequency || userStats.profile.frequency,
          age: mapped.profile.age,
          height: mapped.profile.height,
        },
        training: {
          ...userStats.training,
          frequency: mapped.profile.frequency || userStats.training?.frequency || '3-4 veces/sem',
          type: mapped.profile.sport || userStats.training?.type || 'Gym / Pesas',
        }
      };

      const athleteName = mapped.nameText || "Atleta";
      const welcomeContent = `¡Hola, **${athleteName}**! He enlazado con éxito tu planilla de Google Sheets y analizado tus datos:
- 🏃 **Actividad principal:** ${mapped.profile.sport || "No especificado"}
- 📅 **Frecuencia de entrenamiento:** ${mapped.profile.frequency || "No especificado"}
- 🎯 **Objetivo principal:** ${mapped.goal}
- ⚖️ **Peso actual:** ${mapped.weight} Kg | **Estatura:** ${mapped.profile.height / 100} m | **Edad:** ${mapped.profile.age} años
- 💤 **Calidad del descanso:** ${mapped.restText} | 🍎 **Calidad de alimentación:** ${mapped.nutritionText}

He optimizado tu plan dinámico y de running/calistenia en base a esta información. ¿En qué te gustaría enfocar nuestro entrenamiento de hoy?`;
      
      const newMsg: Message = {
        role: 'model',
        content: welcomeContent,
        timestamp: Date.now()
      };

      setUserStats(updatedStats);
      setSelectedSheetRowIndex(rowIndex);
      
      await saveUserStatsFirestore(googleUser.uid, updatedStats);
      await saveMessageFirestore(googleUser.uid, newMsg);
      
      setMessages(prev => [...prev, newMsg]);
      showToast(`¡Perfil deportivo sincronizado para ${athleteName}!`);
      setActiveTab('dashboard');
    } catch (error: any) {
      console.error(error);
      alert("Error al vincular el perfil seleccionado: " + error.message);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const performResetProfile = async () => {
    const defaultStats: UserStats = {
      xp: 0,
      level: 1,
      streak: 0,
      tier: 'FREE',
      isOnboarded: false,
      trialStartDate: Date.now(),
      subscriptionType: 'NONE',
      goal: 'Mejorar mi rendimiento físico',
      weight: 75,
      dailyCalories: 2500,
      workouts: [],
      profile: {
        sport: 'Gym / Pesas',
        frequency: '3-4 veces/sem'
      },
      device: {
        hasDevice: false,
        isConnected: false,
        primaryMetrics: ['Pasos', 'Frecuencia Cardíaca'],
        brand: 'Ninguno',
        model: '',
        useDaily: true
      },
      training: {
        frequency: '3-4 veces/sem',
        type: 'Gym / Pesas',
        routineSource: 'manual'
      }
    };

    setUserStats(defaultStats);
    setMessages([]);

    if (googleUser) {
      setIsSyncingSheets(true);
      try {
        await saveUserStatsFirestore(googleUser.uid, defaultStats);
        await clearUserMessagesFirestore(googleUser.uid);
        showToast("Tu perfil y todo tu historial han sido restablecidos.");
      } catch (err: any) {
        console.error(err);
        showToast("Error al vaciar datos de la nube: " + err.message);
      } finally {
        setIsSyncingSheets(false);
      }
    } else {
      showToast("Tu perfil y todo tu historial local han sido restablecidos.");
    }
  };

  useEffect(() => {
    (window as any).setActiveTab = setActiveTab;
  }, []);

  useEffect(() => {
    if (scrollRef.current && activeTab === 'coach') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, activeTab]);

  const handleSendMessage = async (text?: string) => {
    const content = text || inputValue;
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: content,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setActiveTab('coach');

    if (googleUser && isInitialLoadComplete) {
      saveMessageFirestore(googleUser.uid, userMessage).catch(err => {
        console.error("Error saving user message:", err);
      });
    }

    try {
      const responseText = await getCoachResponse(content, messages, userStats.tier, false, userStats);
      const coachMessage: Message = {
        role: 'model',
        content: responseText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, coachMessage]);
      if (googleUser && isInitialLoadComplete) {
        saveMessageFirestore(googleUser.uid, coachMessage).catch(err => {
          console.error("Error saving coach response:", err);
        });
      }
      updateXP(userStats.tier === 'PREMIUM' ? 50 : 20);
    } catch (error) {
      console.error("Error getting coach response:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateXP = (amount: number) => {
    setUserStats(prev => {
      const multiplier = prev.tier === 'PREMIUM' ? 1.5 : 1;
      const actualAmount = Math.round(amount * multiplier);
      const newTotalXP = prev.xp + actualAmount;
      
      // Dynamic XP Requirement
      // Level 1–5 → 1000 XP
      // Level 5–10 → 1500 XP
      // Level 10-20 → 2500 XP
      const getXPNeeded = (lvl: number) => {
        if (lvl <= 5) return 1000;
        if (lvl <= 10) return 1500;
        return 2500;
      };

      let newLevel = prev.level;
      let tempXP = newTotalXP;
      
      // Re-calculate level based on total XP (simplest way to handle jumps)
      // For this implementation, we'll just check if we passed the current level threshold
      const currentXPNeeded = getXPNeeded(prev.level);
      const currentLevelXP = prev.xp % currentXPNeeded;
      
      if (currentLevelXP + actualAmount >= currentXPNeeded) {
        newLevel++;
      }
      
      return { ...prev, xp: newTotalXP, level: newLevel };
    });
  };

  const getLevelCategory = (level: number) => {
    if (level <= 5) return "Beginner Performance";
    if (level <= 10) return "Intermediate Athlete";
    if (level <= 20) return "Advanced Competitor";
    if (level <= 50) return "Elite Performer";
    return "Performance Master";
  };

  const handleOnboardingComplete = (data: Partial<UserStats>) => {
    setUserStats(prev => ({ ...prev, ...data, isOnboarded: true }));
    setActiveTab('pricing');
  };

  const handlePricingSelect = (tier: UserType, sub: 'NONE' | 'MONTHLY' | 'ANNUAL') => {
    setUserStats(prev => {
      const updated = {
        ...prev,
        tier,
        subscriptionType: sub
      };

      enviarDatosAdmin("formulario", {
        nombre: updated.nombre || `${updated.profile?.name || ""} ${updated.profile?.lastName || ""}`.trim() || "Atleta",
        deporte: updated.profile?.sport || "",
        frecuencia: updated.profile?.frequency || "",
        objetivo: updated.goal || "",
        edad: updated.profile?.age || "",
        peso: updated.weight || "",
        altura: updated.profile?.height || "",
        plan: tier,
        suscripcion: sub,
        sueno: updated.sleepHours !== undefined ? updated.sleepHours : 7.5,
        sueño: updated.sleepHours !== undefined ? updated.sleepHours : 7.5,
        "sueño (h)": updated.sleepHours !== undefined ? updated.sleepHours : 7.5,
        "Sueño (h)": updated.sleepHours !== undefined ? updated.sleepHours : 7.5,
        sueno_h: updated.sleepHours !== undefined ? updated.sleepHours : 7.5,
        fatiga: updated.fatigueLevel || "Baja",
        Fatiga: updated.fatigueLevel || "Baja",
        fecha: new Date().toLocaleString()
      });

      return updated;
    });

    setActiveTab('dashboard');
  };

  if (activeTab === 'landing') {
    return <LandingView onStart={() => setActiveTab('login')} />;
  }

  if (activeTab === 'login') {
    return <LoginView onLogin={(tier) => {
      setUserStats(prev => ({ ...prev, tier }));
      setActiveTab('onboarding');
    }} />;
  }

  if (!userStats.isOnboarded && activeTab === 'onboarding') {
    return <Onboarding userType={userStats.tier} logoUrl={userStats.logoUrl} onComplete={handleOnboardingComplete} />;
  }

  if (activeTab === 'pricing') {
    return <Pricing onSelect={handlePricingSelect} />;
  }

  const navItems = [
    { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: "Panel" },
    { id: 'coach', icon: <MessageSquare size={20} />, label: "Coach IA" },
    { id: 'routine', icon: <Zap size={20} />, label: "Mi Rutina" },
    { id: 'training', icon: <Dumbbell size={20} />, label: "Entrenamiento" },
    { id: 'nutrition', icon: <Apple size={20} />, label: "Nutrición" },
    { id: 'device', icon: <Activity size={20} />, label: "Dispositivo" },
    { id: 'catalog', icon: <ShoppingCart size={20} />, label: "Catálogo" },
    { id: 'rewards', icon: <Star size={20} />, label: "Niveles" },
  ];

  return (
    <div className="flex h-screen bg-white text-slate-900 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <nav className="w-20 md:w-64 border-r border-slate-100 flex flex-col bg-slate-50/50 z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-blue/20">
            <Bot size={24} />
          </div>
          <div className="hidden md:block">
            <h1 className="text-xl font-black tracking-tighter text-brand-blue italic">CoachAI</h1>
            <p className="text-[10px] text-brand-green font-bold tracking-widest uppercase">Rendimiento con IA</p>
          </div>
        </div>

        <div className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map(item => (
            <NavButton 
              key={item.id}
              icon={item.icon} 
              label={item.label} 
              active={activeTab === item.id} 
              onClick={() => setActiveTab(item.id as ActiveTab)} 
            />
          ))}
        </div>

        <div className="p-4 mt-auto space-y-4">
          <div 
            onClick={() => setActiveTab('rewards')}
            className="hidden md:block bg-white rounded-2xl p-4 border border-slate-100 shadow-sm cursor-pointer hover:border-brand-blue transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider group-hover:text-brand-blue group-hover:italic transition-all">Nivel {userStats.level}</span>
              <span className="text-[10px] uppercase font-bold text-brand-green">{userStats.xp % (userStats.level <= 5 ? 1000 : (userStats.level <= 10 ? 1500 : 2500))} XP</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-brand-green"
                initial={{ width: 0 }}
                animate={{ width: `${(userStats.xp % (userStats.level <= 5 ? 1000 : (userStats.level <= 10 ? 1500 : 2500))) / (userStats.level <= 5 ? 10 : (userStats.level <= 10 ? 15 : 25))}%` }}
              />
            </div>
          </div>
          
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/10' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            <Settings size={20} />
            <span className="hidden md:block font-bold text-sm">Ajustes</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden flex flex-col bg-white">
        <header className="h-20 border-b border-slate-100 px-8 flex items-center justify-between bg-white/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
             <h2 className="text-xl font-black italic tracking-tighter uppercase text-slate-400">
               {navItems.find(n => n.id === activeTab)?.label || activeTab}
             </h2>
          </div>
          
          <div className="flex items-center gap-4">
            {userStats.tier === 'FREE' && (
              <button 
                onClick={() => setActiveTab('pricing')}
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-brand-energy/10 text-brand-energy rounded-full text-xs font-black border border-brand-energy/20 hover:bg-brand-energy hover:text-white transition-all animate-pulse"
              >
                <Crown size={14} className="fill-current" /> PASAR A PREMIUM
              </button>
            )}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all ${
              userStats.tier === 'PREMIUM' 
              ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' 
              : 'bg-slate-100 text-slate-500'
            }`}>
              {userStats.tier === 'PREMIUM' ? <Crown size={14} className="fill-current" /> : null}
              {userStats.tier}
            </div>
            <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
              <UserIcon size={18} />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && <DashboardView key="dashboard" userStats={userStats} onQuickChat={(t) => handleSendMessage(t)} />}
            {activeTab === 'routine' && <RoutineView key="routine" stats={userStats} onUpdate={(data: any) => setUserStats(prev => ({ ...prev, ...data }))} />}
            {activeTab === 'coach' && (
              <CoachView 
                key="coach"
                messages={messages} 
                isLoading={isLoading} 
                inputValue={inputValue}
                setInputValue={setInputValue}
                onSendMessage={handleSendMessage}
                scrollRef={scrollRef}
                tier={userStats.tier}
              />
            )}
            {activeTab === 'training' && (
              <TrainingView 
                key="training" 
                stats={userStats} 
                googleToken={googleToken}
                googleUser={googleUser}
                showToast={showToast}
                onUpdate={(data: any) => setUserStats(prev => ({ ...prev, ...data }))} 
                onRegistrarEntrenamiento={enviarDatosAdmin}
              />
            )}
            {activeTab === 'nutrition' && <NutritionView key="nutrition" stats={userStats} />}
            {activeTab === 'device' && <DeviceView key="device" stats={userStats} onUpdate={(data: any) => setUserStats(prev => ({ ...prev, ...data }))} />}
            {activeTab === 'catalog' && <CatalogView key="catalog" stats={userStats} onUpdate={(data: any) => setUserStats(prev => ({ ...prev, ...data }))} />}
            {activeTab === 'rewards' && <RewardsView key="rewards" stats={userStats} getLevelCategory={getLevelCategory} onUpdate={(data: any) => setUserStats(prev => ({ ...prev, ...data }))} />}
            {activeTab === 'settings' && (
              <SettingsView 
                key="settings" 
                stats={userStats} 
                onUpgrade={() => setActiveTab('pricing')} 
                onUpdate={(data: any) => setUserStats(prev => ({ ...prev, ...data }))} 
                googleUser={googleUser}
                googleToken={googleToken}
                isSyncingSheets={isSyncingSheets}
                onConnectSheets={handleConnectSheets}
                onCreateSheet={handleCreateAndLinkSheet}
                onSyncSheets={handleSyncSheets}
                onDisconnectSheets={handleDisconnectSheets}
                onReset={() => setShowResetConfirm(true)}
                customSheetUrl={customSheetUrl}
                onChangeSheetUrl={setCustomSheetUrl}
                onAnalyzeSheet={handleAnalyzeCustomSheet}
                isAnalyzingSheet={isFetchingCustomSheet}
                importedHeaders={importedHeaders}
                importedRows={importedRows}
                onLinkRowProfile={handleLinkSelectedRowProfile}
                selectedSheetRowIndex={selectedSheetRowIndex}
                mapImportedRowToProfile={mapImportedRowToProfile}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Notification Toast */}
      <AnimatePresence>
         {notification && (
            <motion.div 
               initial={{ opacity: 0, y: 50, scale: 0.9 }}
               animate={{ opacity: 1, y: 0, scale: 1 }}
               exit={{ opacity: 0, y: 20, scale: 0.9 }}
               className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-800 text-white px-6 py-4 rounded-2xl flex items-center gap-3 shadow-2xl max-w-sm text-xs font-bold uppercase tracking-wider font-mono"
            >
               <CheckCircle2 className="text-brand-green scale-110 shrink-0" size={16} />
               <p className="text-slate-100">{notification}</p>
            </motion.div>
         )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
         {showResetConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
               <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white border-2 border-slate-100 max-w-md w-full rounded-[36px] p-8 space-y-6 shadow-2xl"
               >
                  <div className="space-y-2">
                     <h4 className="text-xl font-black italic uppercase tracking-tight text-slate-900">Restablecer Perfil</h4>
                     <p className="text-sm text-slate-500 leading-relaxed">
                        ¿Estás seguro de que deseas restablecer por completo tu nivel atlético, historial de entrenamientos y todas las conversaciones guardadas? Esta acción no se puede deshacer.
                     </p>
                  </div>
                  <div className="flex gap-4">
                     <button 
                        onClick={() => setShowResetConfirm(false)}
                        className="flex-1 py-4 border-2 border-slate-150 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
                     >
                        Cancelar
                     </button>
                     <button 
                        onClick={() => {
                          setShowResetConfirm(false);
                          performResetProfile();
                        }}
                        className="flex-1 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-rose-200"
                     >
                        Restablecer
                     </button>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>
    </div>
  );
}

// --- SUB-VIEWS ---

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group ${
        active 
        ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' 
        : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="hidden md:block font-bold text-sm tracking-tight">{label}</span>
      {active && <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 rounded-full bg-white md:hidden" />}
    </button>
  );
}

interface DashboardProps {
  userStats: UserStats;
  onQuickChat: (t: string) => void;
  key?: string;
}

function LandingView({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <header className="p-8 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue rounded-2xl flex items-center justify-center text-white">
            <Bot size={24} />
          </div>
          <h1 className="text-2xl font-black italic tracking-tighter text-brand-blue">CoachAI</h1>
        </div>
        <button onClick={onStart} className="bg-brand-blue text-white px-6 py-2 rounded-full font-black text-xs uppercase hover:bg-slate-900 transition-all">
          Iniciar Sesión
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-12 max-w-4xl mx-auto py-32">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <span className="bg-brand-green/10 text-brand-green px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">IA Deportiva de Vanguardia</span>
          <h2 className="text-6xl md:text-8xl font-black italic tracking-tighter uppercase leading-[0.9] text-slate-900">
            Optimiza tu <br />
            <span className="text-brand-blue underline decoration-brand-energy decoration-8 underline-offset-8">Rendimiento</span> <br />
            Con Inteligencia.
          </h2>
          <p className="text-xl text-slate-500 font-medium max-w-2xl mx-auto leading-relaxed">
            Un sistema de IA que transforma tus datos y hábitos en resultados reales. Conversa, entrena y mejora como nunca antes.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-col md:flex-row gap-6">
          <button onClick={onStart} className="bg-slate-900 text-white px-12 py-5 rounded-[24px] font-black text-lg uppercase shadow-2xl shadow-slate-900/20 hover:scale-105 transition-all">
            Empezar Gratis
          </button>
          <div className="bg-slate-100 p-1 px-1 rounded-full flex">
             <div className="flex -space-x-3 px-4 py-4">
                {[1,2,3].map(i => <div key={i} className="w-10 h-10 rounded-full border-4 border-white bg-slate-200" />)}
             </div>
             <div className="py-4 pr-6 text-left">
                <p className="text-xs font-black uppercase text-slate-400 leading-none">Únete a</p>
                <p className="text-sm font-black text-slate-900 tracking-tighter">+5,000 ATLETAS</p>
             </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

function LoginView({ onLogin }: { onLogin: (tier: UserType) => void }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white p-12 rounded-[40px] shadow-2xl shadow-slate-200 space-y-10">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-brand-blue rounded-3xl flex items-center justify-center text-white mx-auto shadow-xl shadow-brand-blue/20">
            <Bot size={32} />
          </div>
          <h2 className="text-3xl font-black italic tracking-tighter uppercase text-brand-blue">CoachAI Login</h2>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest font-mono">Acceso al Sistema</p>
        </div>

        <div className="space-y-4">
           <button 
            onClick={() => onLogin('FREE')}
            className="w-full bg-white border-2 border-slate-100 p-6 rounded-3xl flex items-center gap-6 hover:border-brand-blue transition-all group"
           >
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-brand-blue/10 group-hover:text-brand-blue">
                 <UserIcon size={24} />
              </div>
              <div className="text-left">
                 <p className="font-black text-slate-900 uppercase italic tracking-tighter">Acceso Libre</p>
                 <p className="text-xs text-slate-400 font-medium">Modo estándar habilitado</p>
              </div>
           </button>

           <button 
            onClick={() => onLogin('PREMIUM')}
            className="w-full bg-slate-900 p-6 rounded-3xl flex items-center gap-6 hover:bg-brand-blue transition-all group"
           >
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-brand-energy group-hover:bg-white group-hover:text-brand-blue">
                 <Crown size={24} className="fill-current" />
              </div>
              <div className="text-left">
                 <p className="font-black text-white uppercase italic tracking-tighter">Acceso Élite (30 días free)</p>
                 <p className="text-xs text-white/40 font-medium">Motor de IA full activado</p>
              </div>
           </button>
        </div>

        <p className="text-center text-[10px] text-slate-400 font-mono uppercase tracking-widest leading-relaxed">
          Al continuar, aceptas nuestros términos de servicio y política de privacidad de rendimiento.
        </p>
      </div>
    </div>
  );
}

function DeviceView({ stats, onUpdate }: any) {
  const isPremium = stats.tier === 'PREMIUM';
  const [isConnecting, setIsConnecting] = useState(false);
  const [deviceData, setDeviceData] = useState({
    brand: stats.device?.brand || '',
    model: stats.device?.model || '',
    useDaily: stats.device?.useDaily || true,
    batteryLife: stats.device?.batteryStatus || 80,
    metrics: stats.device?.primaryMetrics || []
  });

  const handleSaveDevice = () => {
    onUpdate({ 
      device: { 
        ...stats.device, 
        ...deviceData,
        batteryStatus: deviceData.batteryLife,
        isConnected: true, 
        hasDevice: true 
      } 
    });
    setIsConnecting(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12 max-w-5xl mx-auto pb-20">
      <div className="space-y-4 text-center md:text-left">
        <h3 className="text-4xl font-black italic tracking-tighter uppercase text-slate-900 underline decoration-slate-100 decoration-8 underline-offset-8">Tu Periférico Inteligente.</h3>
        <p className="text-slate-400 font-medium italic">Sincroniza tu biyología con el motor de IA de CoachAI.</p>
      </div>

      <AnimatePresence mode="wait">
        {isConnecting ? (
          <motion.div 
            key="connecting-form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white border-2 border-brand-blue/20 rounded-[48px] p-12 shadow-2xl shadow-brand-blue/5 space-y-10"
          >
            <div className="flex items-center gap-4 border-b border-slate-100 pb-8">
               <div className="w-14 h-14 bg-brand-blue rounded-2xl flex items-center justify-center text-white">
                  <Plus size={28} />
               </div>
               <div>
                  <h4 className="text-2xl font-black italic tracking-tighter uppercase text-slate-900">Vincular Dispositivo</h4>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Configuración de Hardware</p>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
               <div className="space-y-6">
                  <div className="space-y-2">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Marca del Dispositivo</p>
                     <select 
                      value={deviceData.brand}
                      onChange={(e) => setDeviceData(prev => ({ ...prev, brand: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-900 font-bold focus:ring-2 focus:ring-brand-blue/20 outline-none transition-all appearance-none"
                     >
                        <option value="">Seleccionar marca...</option>
                        <option value="CoachAI">CoachAI (Recomendado)</option>
                        <option value="Apple">Apple Watch</option>
                        <option value="Garmin">Garmin</option>
                        <option value="Samsung">Samsung Watch</option>
                        <option value="WHOOP">WHOOP</option>
                        <option value="Oura">Oura Ring</option>
                     </select>
                  </div>

                  <div className="space-y-2">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Modelo Específico</p>
                     <input 
                      type="text"
                      placeholder="Ej: Series 9, Fenix 7, Elite 1..."
                      value={deviceData.model}
                      onChange={(e) => setDeviceData(prev => ({ ...prev, model: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-slate-900 font-bold focus:ring-2 focus:ring-brand-blue/20 outline-none"
                     />
                  </div>

                  <div className="space-y-4 pt-4">
                     <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Batería promedio (%)</p>
                        <span className="text-xl font-black text-brand-blue italic">{deviceData.batteryLife}%</span>
                     </div>
                     <input 
                       type="range" 
                       min="1" 
                       max="100" 
                       value={deviceData.batteryLife}
                       onChange={(e) => setDeviceData(prev => ({ ...prev, batteryLife: parseInt(e.target.value) }))}
                       className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-brand-blue"
                     />
                  </div>
               </div>

               <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                     <div>
                        <p className="font-black italic tracking-tighter uppercase text-slate-900">Uso Diario</p>
                        <p className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-widest">¿Lo usas siempre?</p>
                     </div>
                     <SettingsToggle 
                       active={deviceData.useDaily} 
                       onToggle={(val: boolean) => setDeviceData(prev => ({ ...prev, useDaily: val }))} 
                     />
                  </div>

                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">¿Qué utilizas más para medir?</p>
                  <div className="flex flex-wrap gap-2">
                     {['Sueño', 'Frecuencia Cardíaca', 'Recuperación', 'Entrenamiento', 'Pasos'].map(m => (
                       <button 
                        key={m}
                        onClick={() => {
                          const newMetrics = deviceData.metrics.includes(m) 
                            ? deviceData.metrics.filter(x => x !== m) 
                            : [...deviceData.metrics, m];
                          setDeviceData(prev => ({ ...prev, metrics: newMetrics }));
                        }}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${deviceData.metrics.includes(m) ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                       >
                         {m}
                       </button>
                     ))}
                  </div>
               </div>
            </div>

            <div className="flex gap-4 pt-6">
               <button 
                onClick={() => setIsConnecting(false)}
                className="flex-1 py-5 rounded-[24px] font-black text-xs uppercase tracking-widest text-slate-400 border border-slate-100 hover:bg-slate-50 transition-all"
               >
                 Cancelar
               </button>
               <button 
                onClick={handleSaveDevice}
                className="flex-1 py-5 rounded-[24px] font-black text-xs uppercase tracking-widest bg-brand-blue text-white shadow-xl shadow-brand-blue/20 hover:bg-slate-900 transition-all"
               >
                 Confirmar Sincronización
               </button>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="device-status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            <div className="bg-slate-50 rounded-[40px] p-10 space-y-10 border border-slate-100 group hover:border-brand-blue transition-all">
               <div className="flex items-center justify-between">
                  <div className="w-16 h-16 bg-brand-blue rounded-3xl flex items-center justify-center text-white shadow-xl shadow-brand-blue/20">
                     <Activity size={32} />
                  </div>
                  {stats.device?.isConnected && (
                    <span className="bg-brand-green/10 text-brand-green px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                       <div className="w-1.5 h-1.5 bg-brand-green rounded-full animate-pulse" /> Sincronizado
                    </span>
                  )}
               </div>

               <div className="space-y-4">
                  <h4 className="text-2xl font-black italic tracking-tighter uppercase text-slate-900">Estado de Conexión</h4>
                  <p className="text-slate-500 font-medium leading-relaxed">
                    {stats.device?.isConnected 
                     ? `Tu ${stats.device.brand} ${stats.device.model} está enviando datos al Coach.` 
                     : 'No hay dispositivos vinculados actualmente. Conecta tu wearable para optimizar la IA.'}
                  </p>
               </div>

               <button 
                onClick={() => stats.device?.isConnected ? onUpdate({ device: { ...stats.device, isConnected: false } }) : setIsConnecting(true)}
                className={`w-full py-5 rounded-3xl font-black text-sm uppercase tracking-widest transition-all ${
                  stats.device?.isConnected 
                  ? 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-100' 
                  : 'bg-brand-blue text-white shadow-xl shadow-brand-blue/10 hover:bg-slate-900'
                }`}
              >
                {stats.device?.isConnected ? 'Desvincular Dispositivo' : 'Vincular Wearable'}
              </button>
            </div>

            <div className="space-y-8">
               <div className="bg-brand-energy/5 border border-brand-energy/10 rounded-[40px] p-10 space-y-6">
                  <h5 className="text-xl font-bold italic uppercase tracking-tight text-brand-energy">Métricas en Red</h5>
                  <div className="space-y-4">
                     {stats.device?.isConnected ? (
                       stats.device.primaryMetrics?.map((m: string) => (
                        <div key={m} className="flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                           <span className="font-bold text-slate-700 uppercase tracking-tighter">{m}</span>
                           <Check size={16} className="text-brand-green" />
                        </div>
                      ))
                     ) : (
                       <p className="text-xs text-brand-energy/60 font-medium uppercase tracking-widest">Esperando hardware...</p>
                     )}
                  </div>
               </div>

               <div className="bg-slate-900 rounded-[40px] p-10 text-white flex flex-col justify-between h-full relative overflow-hidden group shadow-2xl shadow-slate-900/10">
                  <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-brand-blue/20 to-transparent pointer-events-none group-hover:w-48 transition-all" />
                  <div className="z-10">
                     <p className="text-[10px] font-mono text-white/40 uppercase tracking-[0.3em] mb-4">CoachAI Ecosystem</p>
                     <h5 className="text-3xl font-black italic tracking-tighter uppercase leading-none">Domina <br /> tus datos.</h5>
                  </div>
                  <div className="z-10 mt-6">
                    {stats.tier === 'PREMIUM' ? (
                      <div className="bg-brand-green/20 text-brand-green p-3 rounded-xl border border-brand-green/10 text-[10px] font-black uppercase tracking-widest">
                         Motor de IA a máxima capacidad
                      </div>
                    ) : (
                      <p className="text-xs text-white/40 font-medium">Desbloquea el análisis avanzado de dispositivos con Premium.</p>
                    )}
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RewardsView({ stats, getLevelCategory, onUpdate }: any) {
  const getXPNeeded = (lvl: number) => {
    if (lvl <= 5) return 1000;
    if (lvl <= 10) return 1500;
    return 2500;
  };
  const nextLevelXP = getXPNeeded(stats.level);
  const progress = (stats.xp % nextLevelXP) / (nextLevelXP / 100);
  const category = getLevelCategory(stats.level);

  const rewards = [
    { title: "Watch S1 Premium", description: "Hardware de monitoreo total.", xp: 0, unlocked: stats.tier === 'PREMIUM', type: 'exclusive', level: 1 },
    { title: "Nutrición IA Plus", description: "Generación de macros con visión computacional.", xp: 500, unlocked: stats.xp >= 500, type: 'feature', level: 1 },
    { title: "Plan de Acción Elite", description: "Protocolos optimizados de recuperación.", xp: 2000, unlocked: stats.xp >= 2000, type: 'exclusive', level: 3 },
    { title: "Descuento VIP 20%", description: "Válido en todo el catálogo de CoachAI.", xp: 5000, unlocked: stats.xp >= 5000, type: 'discount', level: 5 },
    { title: "Socio Fundador", description: "Badge exclusivo y acceso temprano a betas.", xp: 10000, unlocked: stats.xp >= 10000, type: 'exclusive', level: 8 },
    { title: "Suscripción Gratuita", description: "30 días de Premium por cada hito.", xp: 25000, unlocked: stats.xp >= 25000, type: 'discount', level: 15 },
  ];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-12 max-w-6xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div className="space-y-4 text-left">
          <p className="text-brand-blue font-black uppercase tracking-widest text-xs font-mono">{category}</p>
          <h3 className="text-5xl md:text-6xl font-black italic tracking-tighter uppercase text-slate-900 leading-[0.9]">Progreso & <br /><span className="text-brand-blue underline decoration-slate-100 decoration-[12px] underline-offset-8">Recompensas.</span></h3>
        </div>
        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100">
           <div className="p-3 bg-brand-energy/10 text-brand-energy rounded-2xl">
              <Star className="fill-current" size={24} />
           </div>
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Racha de Vida</p>
              <p className="text-xl font-black text-slate-900 italic uppercase italic tracking-tighter">{stats.streak} DÍAS FIJO</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         <div className="bg-slate-900 rounded-[48px] p-12 col-span-1 md:col-span-2 space-y-10 shadow-2xl shadow-slate-900/20 relative overflow-hidden text-white">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
               <Trophy size={300} />
            </div>
            <div className="flex justify-between items-start relative z-10">
               <div className="space-y-2">
                  <p className="text-xs font-mono text-white/40 uppercase tracking-widest font-bold">Nivel Galáctico</p>
                  <p className="text-8xl font-black italic tracking-tighter text-white">{stats.level}</p>
                  <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full w-fit">
                     <div className="w-1.5 h-1.5 bg-brand-green rounded-full" />
                     <span className="text-[10px] font-black uppercase tracking-widest text-brand-green">{category}</span>
                  </div>
               </div>
               <div className="text-right space-y-2">
                  <p className="text-xs font-mono text-white/40 uppercase tracking-widest font-bold">Experiencia Total</p>
                  <p className="text-5xl font-black tracking-tighter text-brand-energy">{stats.xp.toLocaleString()} <span className="text-lg opacity-40 uppercase">XP</span></p>
                  {stats.tier === 'PREMIUM' && (
                    <div className="bg-brand-blue p-2 rounded-xl text-[8px] font-black uppercase inline-block">BONUS 1.5X ACTIVO</div>
                  )}
               </div>
            </div>

            <div className="space-y-6 relative z-10">
               <div className="flex justify-between text-xs font-black uppercase tracking-[0.2em] text-white/40">
                  <span>Próximo Nivel (Nv {stats.level + 1})</span>
                  <span>{Math.round(progress)}% - faltan {nextLevelXP - (stats.xp % nextLevelXP)} XP</span>
               </div>
               <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden p-1 border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-gradient-to-r from-brand-blue to-brand-energy rounded-full shadow-lg shadow-brand-blue/40"
                  />
               </div>
            </div>
         </div>

         <div className="bg-slate-50 border border-slate-100 rounded-[48px] p-10 flex flex-col items-center justify-center text-center space-y-8 group hover:border-brand-blue transition-all">
            <div className="relative">
               <svg className="w-48 h-48 -rotate-90">
                  <circle cx="96" cy="96" r="88" className="stroke-slate-100 fill-none" strokeWidth="8" />
                  <motion.circle 
                    cx="96" cy="96" r="88" 
                    className="stroke-brand-blue fill-none" 
                    strokeWidth="8" 
                    strokeDasharray="552.92"
                    initial={{ strokeDashoffset: 552.92 }}
                    animate={{ strokeDashoffset: 552.92 * (1 - (stats.streak / 30)) }}
                    strokeLinecap="round"
                  />
               </svg>
               <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="p-4 bg-white rounded-3xl shadow-xl shadow-slate-200 group-hover:scale-110 transition-transform">
                     <Flame size={32} className="text-brand-energy" />
                  </div>
               </div>
            </div>
            <div className="space-y-2">
               <p className="text-4xl font-black italic uppercase tracking-tighter text-slate-900">{stats.streak}/30</p>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Días del objetivo mensual</p>
            </div>
            <div className="w-full h-[2px] bg-slate-100" />
            <p className="text-xs text-slate-500 font-medium italic">¡Estás en racha! Sigue así para duplicar tus recompensas.</p>
         </div>
      </div>

      <div className="space-y-10">
         <div className="flex items-center justify-between">
            <h4 className="text-3xl font-black italic uppercase tracking-tight text-slate-900">Beneficios Desbloqueables</h4>
            <div className="flex gap-2">
              {['Todos', 'Features', 'Descuentos'].map(f => (
                <button key={f} className="px-5 py-2 bg-slate-50 border border-slate-100 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all">{f}</button>
              ))}
            </div>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {rewards.map((reward, idx) => (
              <RewardCard 
                key={idx}
                title={reward.title} 
                description={reward.description} 
                xp={reward.xp} 
                unlocked={reward.unlocked} 
                type={reward.type}
              />
            ))}
         </div>
      </div>

      <div className="bg-brand-blue/5 border border-brand-blue/10 rounded-[48px] p-16 text-center space-y-8 relative overflow-hidden">
         <div className="absolute -left-10 -bottom-10 opacity-10">
            <Bot size={200} />
         </div>
         <div className="relative z-10 max-w-2xl mx-auto space-y-6">
            <h5 className="text-3xl font-black italic uppercase tracking-tight text-brand-blue">Mejora tu ritmo de XP</h5>
            <p className="text-slate-600 font-medium text-lg leading-relaxed italic">
               Los miembros Premium ganan un 50% extra de experiencia en cada entrenamiento y tienen acceso a retos semanales exclusivos de 1000 XP.
            </p>
            {stats.tier !== 'PREMIUM' && (
              <button 
                onClick={() => (window as any).setActiveTab('pricing')}
                className="bg-brand-blue text-white px-12 py-5 rounded-[24px] font-black text-sm uppercase shadow-xl shadow-brand-blue/20 hover:scale-105 transition-all"
              >
                Activar Multiplicador Premium
              </button>
            )}
         </div>
      </div>
    </motion.div>
  );
}

function RewardCard({ title, description, xp, unlocked, type }: any) {
  return (
    <div className={`p-8 rounded-[40px] border-2 transition-all relative overflow-hidden group ${unlocked ? 'bg-white border-brand-blue/20 shadow-xl shadow-brand-blue/5' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
       {type === 'hardware' && unlocked && (
         <div className="absolute top-0 right-0 p-4 bg-brand-energy/10 text-brand-energy text-[8px] font-black uppercase tracking-widest rounded-bl-2xl">
            Regalo Premium
         </div>
       )}
       <div className="flex justify-between items-start mb-6">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${unlocked ? 'bg-brand-blue text-white shadow-xl shadow-brand-blue/20' : 'bg-slate-200 text-slate-400'}`}>
             {unlocked ? <Check size={28} /> : <Clock size={28} />}
          </div>
          {!unlocked && xp > 0 && <span className="text-[10px] font-mono font-black uppercase text-slate-400">Req: {xp} XP</span>}
       </div>
       <div className="space-y-1">
          <h5 className="text-xl font-black italic tracking-tighter uppercase text-slate-900 leading-tight">{title}</h5>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">{description}</p>
       </div>
    </div>
  );
}

function DashboardView({ userStats, onQuickChat }: DashboardProps) {
  const getXPNeeded = (lvl: number) => {
    if (lvl <= 5) return 1000;
    if (lvl <= 10) return 1500;
    return 2500;
  };
  const nextLevelXP = getXPNeeded(userStats.level);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-10 pb-20 max-w-6xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-4xl font-black italic tracking-tighter uppercase text-slate-900">Rendimiento Actual</h2>
          </div>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] font-mono">Sincronización en tiempo real • Nivel {userStats.level}</p>
        </div>
        
        <div className="flex gap-4">
          <div 
            className="bg-slate-50 border border-slate-100 p-4 rounded-3xl flex items-center gap-4 cursor-pointer hover:border-brand-blue hover:bg-white transition-all group"
            onClick={() => (window as any).setActiveTab('rewards')}
          >
             <div className="bg-brand-blue text-white px-2 py-1 rounded font-black text-xs group-hover:scale-110 transition-transform">XP</div>
             <div>
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest font-mono">
                   <span className="group-hover:text-brand-blue transition-colors">Progreso Nv {userStats.level}</span>
                   <span>{userStats.xp % nextLevelXP} / {nextLevelXP} XP</span>
                </div>
                <div className="w-32 h-1 bg-slate-200 rounded-full overflow-hidden">
                   <div className="h-full bg-brand-blue" style={{ width: `${(userStats.xp % nextLevelXP) / (nextLevelXP / 100)}%` }} />
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[48px] bg-slate-900 p-10 md:p-16 text-white shadow-2xl shadow-slate-900/20">
        <div className="absolute top-0 right-0 p-12 opacity-10">
           <Bot size={200} />
        </div>
        <div className="relative z-10 space-y-6">
          <div className="space-y-2">
            <h3 className="text-5xl md:text-7xl font-black italic tracking-tighter leading-[0.85] uppercase">
              Sin excusas.<br />Sólo progreso.
            </h3>
            <p className="text-brand-green font-black uppercase tracking-widest text-xs font-mono">Objetivo: {userStats.goal}</p>
          </div>
          
          <div className="pt-4 flex flex-wrap gap-4">
            <button 
              onClick={() => onQuickChat("Actualiza mi peso: 76kg. Entrenamiento completado.")}
              className="bg-brand-blue text-white px-10 py-5 rounded-[24px] font-black text-sm hover:scale-105 transition-all flex items-center gap-2 shadow-xl shadow-brand-blue/20"
            >
              REGISTRAR PROGRESO <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<Flame size={20} />} label="Calorías" value={`${userStats.dailyCalories}`} unit="kcal" color="text-brand-energy" />
        <StatCard icon={<Activity size={20} />} label="Peso" value={`${userStats.weight}`} unit="kg" color="text-brand-blue" />
        <StatCard icon={<TrendingUp size={20} />} label="Racha" value="12" unit="Días" color="text-brand-green" />
        <StatCard icon={<Clock size={20} />} label="Entreno" value="18:00" unit="PM" color="text-slate-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-50 border border-slate-100 rounded-[40px] p-10 space-y-8">
           <div className="flex justify-between items-center">
             <h4 className="text-2xl font-black italic tracking-tighter uppercase text-slate-900">Objetivos</h4>
             <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase font-mono">Camino a la Elite</span>
           </div>
           <div className="space-y-4">
              <MilestoneItem label="Base" description="Registra 7 días seguidos" completed progress={100} />
              <MilestoneItem label="Constancia" description="Mantén tu objetivo de calorías" progress={45} />
              <MilestoneItem label="Peak Performance" description="Alcanza tu peso objetivo" progress={15} />
           </div>
        </div>

        <div className="bg-brand-blue/5 border border-brand-blue/10 rounded-[40px] p-10 space-y-8">
          <div className="flex items-center justify-between">
            <h4 className="text-2xl font-black italic tracking-tighter uppercase text-brand-blue">IA Insights</h4>
            <div className="w-12 h-12 rounded-2xl bg-brand-blue flex items-center justify-center text-white shadow-lg shadow-brand-blue/20">
              <Bot size={24} />
            </div>
          </div>
          <div className="space-y-6">
            <p className="text-lg text-slate-700 leading-relaxed font-medium italic">
              "Tu recuperación ha mejorado un 15% esta semana. Sigue priorizando las 8 horas de sueño para mantener la intensidad actual."
            </p>
            <div className="pt-6 border-t border-brand-blue/10">
              <button 
                onClick={() => onQuickChat("Analiza mi última semana de entrenamiento.")}
                className="text-xs font-black text-brand-blue uppercase tracking-widest flex items-center gap-2 group"
              >
                Ver Análisis Completo <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ icon, label, value, unit, color }: { icon: React.ReactNode, label: string, value: string, unit?: string, color?: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-[40px] p-8 hover:shadow-xl hover:shadow-slate-100 transition-all group">
      <div className="flex items-center justify-between mb-8">
        <div className={`p-4 rounded-2xl bg-slate-50 group-hover:bg-brand-blue group-hover:text-white transition-all ${color}`}>
          {icon}
        </div>
        <div className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
      </div>
      <div>
        <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-black tracking-tighter text-slate-900">{value}</span>
          {unit && <span className="text-sm font-black text-slate-300 uppercase tracking-tighter italic">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

function MilestoneItem({ label, description, progress, completed }: any) {
  return (
    <div className={`p-6 rounded-3xl border transition-all flex items-center justify-between group ${completed ? 'bg-white border-brand-green/20' : 'bg-slate-100/50 border-transparent'}`}>
      <div className="flex items-center gap-5">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${completed ? 'bg-brand-green text-white shadow-lg shadow-brand-green/20' : 'bg-slate-200 text-slate-400'}`}>
          {completed ? <Check size={20} strokeWidth={3} /> : <Target size={20} />}
        </div>
        <div>
          <p className={`font-black uppercase italic tracking-tighter text-lg ${completed ? 'text-slate-900' : 'text-slate-400'}`}>{label}</p>
          <p className="text-xs text-slate-400 font-medium">{description}</p>
        </div>
      </div>
      <div className="text-right hidden md:block">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{progress}%</span>
        <div className="w-20 h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            className={`h-full ${completed ? 'bg-brand-green' : 'bg-slate-400'}`} 
          />
        </div>
      </div>
    </div>
  );
}

function RoutineView({ stats, onUpdate }: any) {
  const isPremium = stats.tier === 'PREMIUM';
  const [isEditing, setIsEditing] = useState(false);
  const [sleepInput, setSleepInput] = useState(stats.sleepHours !== undefined ? stats.sleepHours : 7.5);
  const [fatigueInput, setFatigueInput] = useState(stats.fatigueLevel || 'Baja');

  useEffect(() => {
    if (stats.sleepHours !== undefined) {
      setSleepInput(stats.sleepHours);
    }
    if (stats.fatigueLevel !== undefined) {
      setFatigueInput(stats.fatigueLevel);
    }
  }, [stats.sleepHours, stats.fatigueLevel]);

  const handleSave = () => {
    onUpdate({
      sleepHours: Number(sleepInput),
      fatigueLevel: fatigueInput
    });
    setIsEditing(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12 max-w-6xl mx-auto pb-20">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Zap className="text-brand-energy" size={32} />
          <h3 className="text-4xl font-black italic tracking-tighter uppercase text-slate-900">Mi Rutina Estelar.</h3>
        </div>
        <p className="text-slate-400 font-medium">Control total de tus pilares de rendimiento.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Módulo 1: Descanso */}
        <div className="bg-slate-50 border border-slate-100 rounded-[40px] p-8 space-y-8 group hover:bg-white hover:border-brand-blue transition-all">
          <div className="flex items-center justify-between">
            <h4 className="text-xl font-bold italic tracking-tight uppercase flex items-center gap-2 text-slate-900">
               Descanso
            </h4>
            {isPremium && <span className="text-[10px] bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded font-black uppercase tracking-widest">Auto Sync</span>}
          </div>
          <div className="space-y-6">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block mb-1">Horas de Sueño</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={sleepInput}
                    onChange={(e) => setSleepInput(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold font-mono focus:border-brand-blue focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block mb-1">Nivel de Fatiga</label>
                  <select
                    value={fatigueInput}
                    onChange={(e) => setFatigueInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold focus:border-brand-blue focus:outline-none"
                  >
                    <option value="Baja">Baja</option>
                    <option value="Media">Media</option>
                    <option value="Alta">Alta</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={handleSave}
                    className="flex-1 py-4 rounded-xl bg-brand-blue text-white text-xs font-bold uppercase hover:opacity-90 transition-all"
                  >
                    Guardar
                  </button>
                  <button 
                    onClick={() => {
                      setSleepInput(stats.sleepHours !== undefined ? stats.sleepHours : 7.5);
                      setFatigueInput(stats.fatigueLevel || 'Baja');
                      setIsEditing(false);
                    }}
                    className="flex-1 py-4 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold uppercase hover:bg-slate-200 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Horas de Sueño</p>
                   <div className="flex items-baseline gap-2 mt-1">
                     <span className="text-4xl font-black text-slate-900">{stats.sleepHours !== undefined ? stats.sleepHours : '7.5'}</span>
                     <span className="text-xs text-slate-400 font-bold uppercase italic">Horas</span>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Calidad</p>
                     <p className="font-bold text-lg text-slate-700">{(stats.sleepHours || 7.5) >= 7 ? '90%' : '72%'}</p>
                   </div>
                   <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Fatiga</p>
                     <p className={`font-bold text-lg ${(stats.fatigueLevel || 'Baja') === 'Baja' ? 'text-brand-green' : (stats.fatigueLevel === 'Media' ? 'text-amber-500' : 'text-rose-500')}`}>
                       {stats.fatigueLevel || 'Baja'}
                     </p>
                   </div>
                </div>
                <button 
                  onClick={() => setIsEditing(true)}
                  className="w-full py-4 rounded-2xl bg-white border border-slate-100 text-xs font-black uppercase text-slate-500 hover:border-brand-blue hover:text-brand-blue transition-all"
                >
                  Cargar Datos de Descanso
                </button>
              </>
            )}
          </div>
        </div>

        {/* Módulo 2: Alimentación */}
        <div className="bg-slate-50 border border-slate-100 rounded-[40px] p-8 space-y-8 group hover:bg-white hover:border-brand-energy transition-all">
          <div className="flex items-center justify-between">
            <h4 className="text-xl font-bold italic tracking-tight uppercase flex items-center gap-2 text-slate-900">
               Alimentación
            </h4>
            {isPremium && <span className="text-[10px] bg-brand-energy/10 text-brand-energy px-2 py-0.5 rounded font-black uppercase tracking-widest">Smart Trace</span>}
          </div>
          <div className="space-y-6">
             <div className="flex justify-between items-end">
                <div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Proteína</p>
                   <p className="text-3xl font-black text-slate-900">180<span className="text-xs font-normal">g</span></p>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Calorías</p>
                   <p className="text-3xl font-black text-slate-900">{stats.dailyCalories}</p>
                </div>
             </div>
             <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Hidratación</p>
                <div className="flex gap-1">
                  {Array.from({length: 8}).map((_, i) => (
                    <div key={i} className={`h-6 flex-1 rounded-md ${i < 5 ? 'bg-brand-blue' : 'bg-slate-200'}`} />
                  ))}
                </div>
             </div>
             {!isPremium && (
               <button className="w-full py-4 rounded-2xl bg-white border border-slate-100 text-xs font-black uppercase text-slate-500 hover:border-brand-energy hover:text-brand-energy transition-all">
                 Registrar Comidas
               </button>
             )}
          </div>
        </div>

        {/* Módulo 3: Entrenamiento */}
        <div className="bg-slate-50 border border-slate-100 rounded-[40px] p-8 space-y-8 group hover:bg-white hover:border-brand-green transition-all">
          <div className="flex items-center justify-between">
            <h4 className="text-xl font-bold italic tracking-tight uppercase flex items-center gap-2 text-slate-900">
               Entrenamiento
            </h4>
            {isPremium && <span className="text-[10px] bg-brand-green/10 text-brand-green px-2 py-0.5 rounded font-black uppercase tracking-widest">Adaptive Plan</span>}
          </div>
          <div className="space-y-6">
            <div>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Frecuencia</p>
               <p className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">{stats.training?.frequency || 'Carga plan'}</p>
            </div>
            <div>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Rutina Actual</p>
               <p className="text-sm font-bold text-slate-500 mt-1">{stats.training?.routineSource === 'pdf' ? '📄 PDF Analizado' : 'Sin rutina activa'}</p>
            </div>
            <button className="w-full py-4 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase hover:bg-brand-blue transition-all shadow-xl shadow-slate-900/10">
              {isPremium ? 'Optimizar con IA' : 'Actualizar Rutina'}
            </button>
          </div>
        </div>
      </div>

      {isPremium && (
        <div className="bg-slate-900 p-10 rounded-[40px] text-white">
          <div className="flex flex-col md:flex-row gap-10 items-center">
            <div className="shrink-0 w-24 h-24 rounded-3xl bg-white/10 text-brand-green flex items-center justify-center">
              <Bot size={48} />
            </div>
            <div className="space-y-4">
              <h4 className="text-2xl font-black italic tracking-tighter uppercase">Análisis Proactivo de IA</h4>
              <p className="text-white/60 font-medium leading-relaxed">
                Tus datos de sueño muestran una correlación directa con tu fatiga en el gimnasio los miércoles. He ajustado tu plan de hidratación y te sugiero mover tu sesión pesada a los jueves para maximizar el anabolismo.
              </p>
              <button 
                onClick={() => onUpdate({ activeTab: 'coach' })}
                className="text-sm font-black uppercase text-brand-green border-b-2 border-brand-green pb-1 hover:text-white hover:border-white transition-all"
              >
                Discutir ajustes con Coach
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function CoachView({ messages, isLoading, inputValue, setInputValue, onSendMessage, scrollRef, tier }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-full max-w-4xl mx-auto"
    >
      <div className="flex-1 overflow-y-auto space-y-8 pr-4 pb-32 mt-4 custom-scrollbar" ref={scrollRef}>
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <div className="py-20 text-center space-y-10">
               <div className="relative">
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-brand-blue flex items-center justify-center text-white shadow-2xl shadow-brand-blue/20">
                    <MessageSquare size={36} />
                  </div>
                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-brand-energy rounded-full flex items-center justify-center text-white border-4 border-white">
                     <Zap size={14} className="fill-current" />
                  </div>
               </div>
               <div className="space-y-4">
                <h3 className="text-3xl font-black italic tracking-tighter uppercase text-slate-900">Coach de Rendimiento IA.</h3>
                <p className="text-slate-400 max-w-xs mx-auto text-sm font-medium leading-relaxed">¿Cómo puedo optimizar tu rendimiento hoy? Estoy listo para analizar tus datos.</p>
               </div>
               <div className="flex flex-wrap justify-center gap-3">
                  {["Analiza mi nutrición", "Tips de recuperación", "Optimiza mi entrenamiento"].map(t => (
                    <button 
                      key={t} 
                      onClick={() => onSendMessage(t)} 
                      className="bg-white border focus:border-brand-blue border-slate-100 px-6 py-3 rounded-2xl text-xs hover:bg-slate-50 transition-all font-black uppercase tracking-widest text-slate-400 hover:text-slate-900"
                    >
                      {t}
                    </button>
                  ))}
               </div>
            </div>
          )}
          {messages.map((m: any, i: number) => (
             <motion.div
                key={m.timestamp + i}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[98%] md:max-w-[95%] flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg shrink-0 mt-2 flex items-center justify-center ${m.role === 'user' ? 'bg-slate-100 text-slate-400' : 'bg-brand-blue text-white'} font-black text-[10px]`}>
                    {m.role === 'user' ? <UserIcon size={14} /> : 'AI'}
                  </div>
                  <div className={`py-2 space-y-4 flex-1 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <div className="markdown-body text-sm md:text-base leading-relaxed text-slate-700">
                      <Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>
                    </div>
                  </div>
                </div>
             </motion.div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
               <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-brand-blue text-white flex items-center justify-center font-bold text-[10px] animate-pulse">AI</div>
                  <div className="py-2 flex gap-1 items-center">
                    <div className="w-2 h-2 bg-brand-blue rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-brand-blue rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-brand-blue rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
               </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-6 left-4 right-4 md:left-8 md:right-8 bg-gradient-to-t from-white via-white to-transparent pt-12 pb-2">
        <div className="relative max-w-4xl mx-auto">
          <input 
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSendMessage()}
            placeholder="Escribe algo al Coach..."
            className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-6 pl-8 pr-20 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 transition-all font-medium text-slate-900 shadow-2xl shadow-slate-100"
          />
          <button 
            onClick={() => onSendMessage()}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-brand-blue text-white w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl shadow-brand-blue/20"
          >
            <Send size={24} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

interface TrainingProps {
  stats: UserStats;
  googleToken: string | null;
  googleUser?: any;
  onUpdate: (data: any) => void;
  showToast?: (msg: string) => void;
  onRegistrarEntrenamiento?: (tipo: string, datos: any) => Promise<void>;
  key?: string;
}

function TrainingView({ stats, googleToken, googleUser, onUpdate, showToast, onRegistrarEntrenamiento }: TrainingProps) {
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [textComments, setTextComments] = useState("");
  const [typeInput, setTypeInput] = useState("");
  const [durationInput, setDurationInput] = useState(60);
  const [intensityInput, setIntensityInput] = useState<'Alta' | 'Media' | 'Baja'>('Media');
  const [energyInput, setEnergyInput] = useState<'Alta' | 'Media' | 'Baja'>('Media');
  const [isTrainedInput, setIsTrainedInput] = useState("Sí");
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [analysisFeedback, setAnalysisFeedback] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayedWorkouts = stats.workouts && stats.workouts.length > 0 
    ? stats.workouts 
    : [
        { id: '1', type: 'Hipertrofia F-1', duration: 75, date: '04 May', intensity: 'Alta' },
        { id: '2', type: 'Recuperación Activa', duration: 25, date: '02 May', intensity: 'Baja' },
        { id: '3', type: 'Fuerza Híbrida', duration: 60, date: '30 Abr', intensity: 'Media' },
      ];

  const handleOpenExistingWorkout = (w: any) => {
    setTypeInput(w.type || "");
    setDurationInput(w.duration || 60);
    
    const intVal = w.intensity || "Media";
    if (intVal === 'high' || intVal === 'Alta' || String(intVal).toLowerCase().includes("alt")) {
      setIntensityInput("Alta");
    } else if (intVal === 'low' || intVal === 'Baja' || String(intVal).toLowerCase().includes("baj")) {
      setIntensityInput("Baja");
    } else {
      setIntensityInput("Media");
    }

    setEnergyInput("Media"); 
    setIsTrainedInput("Sí");
    setTextComments(w.type ? `Sincronizando/Modificando entrenamiento previo de ${w.type}` : "");
    setShowRegisterModal(true);
  };

  const formatDate = (d: any) => {
    if (!d) return "--";
    if (typeof d === 'string') return d;
    try {
      const dateObj = new Date(d);
      return dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    } catch (e) {
      return String(d);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFileName(file.name);
    setUploadingFile(true);
    setAnalysisFeedback(null);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      if (result) {
        const parts = result.split(',');
        const mimeType = parts[0].match(/:(.*?);/)?.[1] || file.type;
        const base64 = parts[1];
        setImageBase64(base64);
        setImageMimeType(mimeType);
        
        // Auto-extract with AI
        setIsAnalyzing(true);
        try {
          const res = await analyzeWorkout(textComments, base64, mimeType);
          if (res) {
            if (res.tipo) setTypeInput(res.tipo);
            if (res.duracion) setDurationInput(res.duracion);
            
            const intVal = res.intensidad || "Media";
            if (intVal.toLowerCase().includes("alt")) setIntensityInput("Alta");
            else if (intVal.toLowerCase().includes("baj")) setIntensityInput("Baja");
            else setIntensityInput("Media");

            const nrgVal = res.energia || "Media";
            if (nrgVal.toLowerCase().includes("alt")) setEnergyInput("Alta");
            else if (nrgVal.toLowerCase().includes("baj")) setEnergyInput("Baja");
            else setEnergyInput("Media");

            if (res.entreno) setIsTrainedInput(res.entreno);
            
            setAnalysisFeedback("¡Análisis de archivo completado! Formulario rellenado automáticamente por la IA.");
          }
        } catch (err) {
          console.error(err);
          setAnalysisFeedback("No se pudo extraer la información automáticamente. Por favor llena los datos de forma manual.");
        } finally {
          setIsAnalyzing(false);
        }
      }
      setUploadingFile(false);
    };
    reader.onerror = () => {
      setUploadingFile(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeWithAI = async () => {
    if (!textComments.trim() && !imageBase64) {
      setAnalysisFeedback("Por favor escribe comentarios o sube una imagen/archivo para que CoachAI pueda analizar.");
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisFeedback(null);
    
    try {
      const result = await analyzeWorkout(textComments, imageBase64 || undefined, imageMimeType || undefined);
      if (result) {
        if (result.tipo) setTypeInput(result.tipo);
        if (result.duracion) setDurationInput(result.duracion);
        
        const intVal = result.intensidad || "Media";
        if (intVal.toLowerCase().includes("alt")) setIntensityInput("Alta");
        else if (intVal.toLowerCase().includes("baj")) setIntensityInput("Baja");
        else setIntensityInput("Media");

        const nrgVal = result.energia || "Media";
        if (nrgVal.toLowerCase().includes("alt")) setEnergyInput("Alta");
        else if (nrgVal.toLowerCase().includes("baj")) setEnergyInput("Baja");
        else setEnergyInput("Media");

        if (result.entreno) setIsTrainedInput(result.entreno);
        
        setAnalysisFeedback("¡Formulario adaptado con los datos extraídos de la IA!");
      }
    } catch (err) {
      console.error(err);
      setAnalysisFeedback("Error al procesar la información de forma automática. Por favor, rellenar manualmente.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmitWorkout = async () => {
    if (!typeInput.trim()) {
      alert("Por favor ingresa un nombre o tipo de entrenamiento (ej: Fútbol, Pesas).");
      return;
    }

    setIsSubmitting(true);
    try {
      const athleteName = `${stats.profile?.name || ""} ${stats.profile?.lastName || ""}`.trim() || stats.nombre || googleUser?.displayName || "Atleta";
      const fechaActual = new Date().toLocaleString();

      // Submit to Google Spreadsheet (Admin tab "Entrenamientos")
      // Send all possible key variations for perfect column mapping in Apps Script
      const payload = {
        usuario: athleteName,
        Usuario: athleteName,
        nombre: athleteName,
        fecha: fechaActual,
        Fecha: fechaActual,
        entreno: isTrainedInput,
        Entreno: isTrainedInput,
        entrenó: isTrainedInput,
        Entrenó: isTrainedInput,
        tipo: typeInput,
        mensaje: textComments || `Entrenamiento de ${typeInput} (${durationInput}m)`,
        intensidad: intensityInput,
        Intensidad: intensityInput,
        energia: energyInput,
        energía: energyInput,
        Energía: energyInput,
        duracion: durationInput,
        plan: stats.tier,
        nivel: stats.level
      };

      if (onRegistrarEntrenamiento) {
        await onRegistrarEntrenamiento("entrenamiento", payload);
      } else {
        await enviarDatosAdmin("entrenamiento", payload);
      }

      // Calculate new XP & Level Up
      const multiplier = stats.tier === 'PREMIUM' ? 1.5 : 1;
      const baseXP = stats.tier === 'PREMIUM' ? 80 : 40;
      const actualXPAdded = Math.round(baseXP * multiplier);
      
      const getRequiredXP = (lvl: number) => {
        if (lvl <= 5) return 1000;
        if (lvl <= 10) return 1500;
        return 2500;
      };
      
      let finalXP = stats.xp + actualXPAdded;
      let finalLevel = stats.level;
      let threshold = getRequiredXP(finalLevel);
      
      while (finalXP >= threshold) {
        finalXP -= threshold;
        finalLevel += 1;
        threshold = getRequiredXP(finalLevel);
      }

      // Add dynamic workout entry to stats
      const newEntry: Workout = {
        id: Date.now().toString(),
        type: typeInput,
        duration: durationInput,
        intensity: (intensityInput === 'Alta' ? 'high' : (intensityInput === 'Baja' ? 'low' : 'medium')) as any,
        intensityRaw: intensityInput,
        energy: energyInput,
        date: Date.now()
      };

      const revisedWorkouts = [newEntry, ...(stats.workouts || [])];

      // Auto-sync directly to user's Google Sheets if connected and linked
      let syncResultSucceeded = false;
      if (googleToken && stats.linkedSheetId) {
        try {
          const updatedStatsObject = {
            ...stats,
            workouts: revisedWorkouts,
            xp: finalXP,
            level: finalLevel,
            streak: stats.streak + 1
          };
          await syncDataToGoogleSpreadsheet(googleToken, stats.linkedSheetId, updatedStatsObject);
          syncResultSucceeded = true;
        } catch (syncErr: any) {
          console.error("Error automatic-syncing to Google Sheet on workout submit:", syncErr);
        }
      }

      // Update parent state
      onUpdate({
        workouts: revisedWorkouts,
        xp: finalXP,
        level: finalLevel,
        streak: stats.streak + 1
      });

      if (showToast) {
        if (googleToken && stats.linkedSheetId && syncResultSucceeded) {
          showToast("¡Sesión registrada y sincronizada con éxito en tu Google Sheet!");
        } else if (googleToken && stats.linkedSheetId && !syncResultSucceeded) {
          showToast("Sesión registrada localmente. Hubo un detalle al sincronizar con Google Sheets.");
        } else {
          showToast("¡Sesión registrada con éxito de forma local!");
        }
      }

      // Reset modal and inputs
      setTextComments("");
      setTypeInput("");
      setDurationInput(60);
      setIntensityInput("Media");
      setEnergyInput("Media");
      setIsTrainedInput("Sí");
      setSelectedFileName(null);
      setImageBase64(null);
      setImageMimeType(null);
      setAnalysisFeedback(null);
      setShowRegisterModal(false);

    } catch (err: any) {
      console.error("Error al registrar entrenamiento:", err);
      alert("No se pudo completar el registro: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-10 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-4xl font-black italic tracking-tighter uppercase text-slate-900">Log de Rendimiento.</h3>
          <p className="text-slate-400 text-sm font-medium">Registra tus sesiones y monitorea tendencias de intensidad.</p>
        </div>
        <button 
          onClick={() => setShowRegisterModal(true)}
          className="bg-brand-blue text-white px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-brand-blue/10"
        >
          <Plus size={20} /> REGISTRAR SESIÓN
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="p-10 bg-slate-50 border border-slate-100 rounded-[40px] md:col-span-3">
            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-8 font-mono">Mapa de Actividad Anual</p>
            <div className="grid grid-cols-7 gap-3">
              {['L','M','X','J','V','S','D'].map((day, i) => (
                <div key={day+i} className="text-center font-bold text-[10px] text-slate-300 uppercase">{day}</div>
              ))}
              {Array.from({length: 28}).map((_, i) => (
                <div key={i} className={`aspect-square rounded-lg transition-all ${[0, 3, 4, 7, 10, 11, 15, 16, 20, 21].includes(i) || (stats.workouts && stats.workouts.length > 0 && i < stats.workouts.length) ? 'bg-brand-blue shadow-md shadow-brand-blue/20' : 'bg-slate-200'}`} />
              ))}
            </div>
         </div>
         <div className="p-10 bg-slate-900 rounded-[40px] flex flex-col justify-end text-white shadow-xl shadow-slate-900/10">
            <h5 className="text-2xl font-black uppercase tracking-tighter italic">RACHA</h5>
            <p className="text-6xl font-black italic tracking-tighter leading-none">{stats.streak} <span className="text-lg font-bold not-italic opacity-40">DÍAS</span></p>
            <p className="text-xs font-medium opacity-40 mt-4 leading-relaxed">Sigue empujando, CoachAI detecta un pico de fuerza potencial para mañana.</p>
         </div>
      </div>

      <div className="space-y-6">
        <h4 className="text-2xl font-black italic tracking-tight uppercase text-slate-900">Sesiones Recientes</h4>
        <div className="grid grid-cols-1 gap-4">
          {displayedWorkouts.map((w: any) => (
            <div 
              key={w.id} 
              onClick={() => handleOpenExistingWorkout(w)}
              className="bg-white border border-slate-100 rounded-[32px] p-8 flex flex-wrap gap-8 items-center justify-between group hover:border-brand-blue hover:shadow-lg transition-all cursor-pointer"
            >
              <div className="flex items-center gap-8">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-brand-blue group-hover:text-white transition-all">
                  <Activity size={28} />
                </div>
                <div>
                  <p className="font-black text-xl italic tracking-tighter uppercase text-slate-900 leading-none">{w.type}</p>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest font-mono mt-1">
                    {formatDate(w.date)} • {w.intensity === 'high' ? 'Alta' : w.intensity === 'medium' ? 'Media' : w.intensity === 'low' ? 'Baja' : w.intensity} Load
                  </p>
                </div>
              </div>
              <div className="flex gap-16">
                <div className="text-center">
                  <p className="text-[10px] uppercase font-bold text-slate-300 tracking-widest font-mono">Tiempo</p>
                  <p className="font-black text-2xl text-slate-900">{w.duration}<span className="text-xs font-normal opacity-40">m</span></p>
                </div>
                <div className="text-center">
                   <p className="text-[10px] uppercase font-bold text-slate-300 tracking-widest font-mono">Progreso</p>
                   <p className="text-2xl font-black text-brand-green tracking-tighter">+12%</p>
                </div>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenExistingWorkout(w);
                }}
                className="w-14 h-14 rounded-full border-2 border-slate-100 flex items-center justify-center text-slate-300 hover:bg-brand-blue hover:text-white hover:border-brand-blue transition-all"
              >
                <ChevronRight size={24} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* REGISTRO DE ENTRENAMIENTO MODAL */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto transition-all animate-in fade-in duration-200">
          <div 
            className="bg-white rounded-[40px] border border-slate-100 max-w-2xl w-full p-8 md:p-10 my-8 shadow-2xl relative max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
          >
              {/* Close Button */}
              <button 
                onClick={() => setShowRegisterModal(false)}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"
              >
                <X size={24} />
              </button>

              <div className="space-y-6">
                <div>
                  <span className="text-[10px] bg-brand-blue/10 text-brand-blue px-3 py-1 rounded-full font-black uppercase tracking-widest font-mono">
                    Módulo de Carga Inteligente
                  </span>
                  <h3 className="text-3xl font-black italic tracking-tighter uppercase text-slate-900 mt-3">
                    Registrar Entrenamiento.
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">
                    Carga tus datos mediante fotos/capturas, comentarios de voz redactados en texto, o completa manualmente.
                  </p>
                </div>

                {/* AI / FILE ATTACHMENT AND COMMENTS AREA */}
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono block">
                      Comentarios o texto de voz de tu entrenamiento (Opcional)
                    </label>
                    <textarea
                      placeholder="Ej: Hoy entrené Fútbol con amigos durante 80 minutos. El entreno fue de intensidad media y me sentí con mucha energía..."
                      value={textComments}
                      onChange={(e) => setTextComments(e.target.value)}
                      className="w-full h-24 p-4 text-sm bg-white border border-slate-200 rounded-2xl focus:border-brand-blue focus:outline-none focus:ring-0 resize-none font-medium text-slate-700 placeholder:text-slate-300 transition-all"
                    />
                  </div>

                  {/* Drag-n-drop simulated File Upload Row */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono block">
                      Sube una captura, foto o archivo del entrenamiento (Reloj, App, etc.)
                    </label>
                    
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 hover:border-brand-blue rounded-3xl p-6 text-center cursor-pointer bg-white transition-all group flex flex-col items-center justify-center gap-2"
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        accept="image/*,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      
                      {uploadingFile ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue"></div>
                          <p className="text-xs font-bold text-slate-500">Subiendo archivo...</p>
                        </div>
                      ) : selectedFileName ? (
                        <div className="flex items-center gap-3">
                          <FileImage className="text-brand-blue" size={32} />
                          <div className="text-left">
                            <p className="text-sm font-bold text-slate-800 leading-tight truncate max-w-[250px]">{selectedFileName}</p>
                            <p className="text-[10px] font-mono text-brand-green font-bold">¡ARCHIVO CARGADO!</p>
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFileName(null);
                              setImageBase64(null);
                              setImageMimeType(null);
                            }}
                            className="p-2 hover:bg-rose-50 text-rose-500 rounded-full transition-colors ml-4"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 group-hover:bg-brand-blue/10 group-hover:text-brand-blue transition-all flex items-center justify-center">
                            <Upload size={20} />
                          </div>
                          <p className="text-xs font-bold text-slate-700">Haz clic aquí para seleccionar tu foto o archivo</p>
                          <p className="text-[10px] text-slate-400 font-medium">Soporta imágenes de reloj deportivo, capturas de apps, o PDF</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Extract with Gemini Action Button */}
                  <button
                    type="button"
                    onClick={handleAnalyzeWithAI}
                    disabled={isAnalyzing || uploadingFile}
                    className="w-full py-3 px-6 rounded-2xl bg-slate-900 text-white font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-brand-blue active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        EXAMINANDO CON COACHAI IA...
                      </>
                    ) : (
                      <>
                        <Bot size={16} />
                        ANALIZAR CON COACHAI IA
                      </>
                    )}
                  </button>

                  {analysisFeedback && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className={`p-3 rounded-xl text-center text-xs font-bold ${analysisFeedback.includes("Error") || analysisFeedback.includes("No") ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-brand-blue/5 text-brand-blue border border-brand-blue/10'}`}
                    >
                      {analysisFeedback}
                    </motion.div>
                  )}
                </div>

                {/* FORMULARIO RESULTANTE EXTRAIDO O MANUAL */}
                <div className="space-y-4 pt-2">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest font-mono">
                    Campos del Entrenamiento
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block mb-1">
                        ¿Entrenó hoy?
                      </label>
                      <select
                        value={isTrainedInput}
                        onChange={(e) => setIsTrainedInput(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold focus:border-brand-blue focus:outline-none text-slate-700"
                      >
                        <option value="Sí">Sí, realicé entrenamiento</option>
                        <option value="No">No, día de descanso</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block mb-1">
                        Tipo de Deporte / Sesión
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Calistenia, Fútbol, Musculación"
                        value={typeInput}
                        onChange={(e) => setTypeInput(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-brand-blue focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block mb-1">
                        Duración (Minutos)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="600"
                        value={durationInput}
                        onChange={(e) => setDurationInput(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold font-mono text-slate-700 focus:border-brand-blue focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block mb-1">
                        Intensidad Percibida
                      </label>
                      <select
                        value={intensityInput}
                        onChange={(e) => setIntensityInput(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold focus:border-brand-blue focus:outline-none text-slate-700"
                      >
                        <option value="Alta">Alta (Carga máxima)</option>
                        <option value="Media">Media (Frecuencia activa)</option>
                        <option value="Baja">Baja (Recuperación)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono block mb-1">
                        Nivel de Energía
                      </label>
                      <select
                        value={energyInput}
                        onChange={(e) => setEnergyInput(e.target.value as any)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold focus:border-brand-blue focus:outline-none text-slate-700"
                      >
                        <option value="Alta">Alta (Enérgico)</option>
                        <option value="Media">Media (Normal)</option>
                        <option value="Baja">Baja (Fatigado)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* MODAL ACTION FOOTER */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleSubmitWorkout}
                    disabled={isSubmitting || isAnalyzing || uploadingFile}
                    className="flex-1 py-4 rounded-2xl bg-brand-blue hover:bg-brand-blue/90 text-white font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-brand-blue/15 active:scale-98 transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        SUBIENDO ENTRENAMIENTO...
                      </>
                    ) : (
                      <>
                        CONFORME Y SUBIR
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("¿Deseas descartar el registro?")) {
                        setShowRegisterModal(false);
                      }
                    }}
                    className="sm:w-1/3 py-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold uppercase text-xs tracking-wider transition-all"
                  >
                    CANCELAR
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </motion.div>
  );
}

function NutritionView({ stats }: any) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-12 max-w-5xl mx-auto pb-20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
        <div className="space-y-8">
          <h3 className="text-4xl font-black italic tracking-tighter uppercase text-slate-900 leading-none">Motor de Energía.</h3>
          <div className="bg-white border border-slate-100 rounded-[48px] p-12 space-y-12 shadow-2xl shadow-slate-100/50">
             <div className="flex items-center justify-between pb-10 border-b border-slate-100">
                <div>
                  <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em] font-mono mb-2">Ingesta de Hoy</p>
                  <p className="text-6xl font-black tracking-tighter text-slate-900">{stats.dailyCalories} <span className="text-lg font-bold italic text-slate-300">KCAL</span></p>
                </div>
                <div className="w-24 h-24 rounded-[32px] bg-brand-energy/10 flex items-center justify-center text-brand-energy shadow-xl shadow-brand-energy/5">
                  <Flame size={48} />
                </div>
             </div>
             
             <div className="space-y-10">
                <MacroBar label="Proteína" value="180g" percentage={80} color="bg-brand-blue" />
                <MacroBar label="Carbohidratos" value="310g" percentage={65} color="bg-brand-energy" />
                <MacroBar label="Grasas" value="65g" percentage={50} color="bg-slate-900" />
             </div>

             <button className="w-full py-5 rounded-3xl bg-slate-900 text-white font-black uppercase text-sm tracking-widest hover:bg-brand-blue transition-colors shadow-2xl shadow-slate-900/20">
                Planificador de Comidas IA
             </button>
          </div>
        </div>

        <div className="space-y-10">
           <div className="bg-slate-900 rounded-[48px] p-12 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-20">
                 <Apple size={120} />
              </div>
              <div className="relative z-10 space-y-6">
                <h4 className="text-3xl font-black italic tracking-tighter uppercase leading-none">Recomendación <br /> IA de Hoy</h4>
                <p className="text-white/60 font-medium leading-relaxed italic">
                  "CoachAI detecta un déficit de magnesio en tus últimas 48h según tus registros. Añade 30g de semillas de calabaza a tu snack nocturno para mejorar la MTG y la recuperación muscular."
                </p>
              </div>
           </div>

           <div className="space-y-6">
              <h5 className="text-xl font-black uppercase italic tracking-tight text-slate-900 leading-none">Guías de Nutrición</h5>
              <div className="grid grid-cols-1 gap-4">
                 <Tip text="Anabolismo Peak: 2.2g de proteína por kg de peso para mantener masa muscular magra." />
                 <Tip text="Carga de Glucógeno: Carbs complejos 2 horas antes de sesiones de cardio intenso." />
                 <Tip text="Ventana de Ayuno: Un split 16:8 mejora la sensibilidad a la insulina." />
              </div>
           </div>
        </div>
      </div>
    </motion.div>
  );
}

function MacroBar({ label, value, percentage, color }: any) {
  return (
    <div className="space-y-4 px-2">
      <div className="flex justify-between text-sm items-center">
        <span className="text-slate-900 font-black italic tracking-tighter uppercase">{label}</span>
        <span className="font-mono text-xs font-bold text-slate-300">{value}</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={`h-full ${color} shadow-lg shadow-black/5`} 
        />
      </div>
    </div>
  );
}

function Tip({ text }: any) {
  return (
    <div className="flex gap-5 group cursor-default p-6 bg-white border border-slate-100 rounded-3xl hover:border-brand-blue transition-all">
      <div className="shrink-0 w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-brand-blue group-hover:bg-brand-blue group-hover:text-white transition-all">
         <Star size={18} />
      </div>
      <p className="text-sm text-slate-500 leading-relaxed font-bold group-hover:text-slate-900 transition-colors uppercase tracking-tight">{text}</p>
    </div>
  );
}

function CatalogView({ stats, onUpdate }: any) {
  const products = [
    { id: 'watch', name: 'CoachAI Watch S1', category: 'wearable', price: stats.tier === 'PREMIUM' ? 0 : 199.99, description: 'Sincronización total con la IA deportiva.', recommended: stats.tier === 'PREMIUM' },
    { id: '1', name: 'Whey Protein Isolate', category: 'supplements', price: 54.99, description: 'Alta pureza para recuperación muscular.', recommended: stats.profile?.goal === 'Ganar músculo' },
    { id: '2', name: 'Creatine Monohydrate', category: 'supplements', price: 29.99, description: 'Mejora la potencia explosiva.', recommended: true },
    { id: '3', name: 'Performance Tee', category: 'apparel', price: 35.00, description: 'Tejido transpirable de alta tecnología.', recommended: false }
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12 pb-20 max-w-6xl mx-auto">
      <div className="text-center md:text-left space-y-2">
        <h2 className="text-4xl font-black italic tracking-tighter uppercase text-slate-900 underline decoration-slate-100 decoration-[12px] underline-offset-8">Arsenal de Rendimiento.</h2>
        <p className="text-slate-400 font-bold text-[10px] font-mono uppercase tracking-[0.2em]">Recomendaciones IA basadas en tu motor de entrenamiento</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {products.map(product => (
          <div key={product.id} className={`p-8 rounded-[40px] border flex flex-col justify-between h-[500px] transition-all group ${product.recommended ? 'bg-white border-brand-blue shadow-2xl shadow-brand-blue/5' : 'bg-slate-50 border-slate-100'}`}>
            <div className="space-y-6">
               <div className="flex justify-between items-start">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${product.recommended ? 'bg-brand-blue text-white shadow-xl shadow-brand-blue/20' : 'bg-white text-slate-400 border border-slate-100'}`}>
                    <Package size={28} />
                  </div>
                  {product.recommended && (
                    <span className="bg-brand-energy/10 text-brand-energy px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Recommended</span>
                  )}
               </div>
               <div className="space-y-2">
                 <h3 className="text-2xl font-black italic tracking-tighter uppercase text-slate-900 leading-tight">{product.name}</h3>
                 <p className="text-sm text-slate-500 font-medium leading-relaxed">{product.description}</p>
               </div>
            </div>
            
            <div className="space-y-6 pt-6 border-t border-slate-100">
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-bold text-slate-300 uppercase">$</span>
                <span className="text-4xl font-black tracking-tighter text-slate-900">{product.price}</span>
              </div>
              <button className={`w-full py-5 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${product.recommended ? 'bg-slate-900 text-white hover:bg-brand-blue shadow-xl shadow-slate-900/20' : 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-100'}`}>
                Integrar al Plan
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="bg-brand-energy/5 border border-brand-energy/20 rounded-[48px] p-12 flex flex-col md:flex-row items-center gap-10">
        <div className="w-16 h-16 rounded-3xl bg-brand-energy text-white flex items-center justify-center shrink-0 shadow-xl shadow-brand-energy/20">
          <Star size={32} fill="currentColor" />
        </div>
        <div className="space-y-2 text-center md:text-left">
           <h4 className="text-2xl font-black italic uppercase tracking-tight text-brand-energy">Incentivo de Constancia</h4>
           <p className="text-lg text-slate-700 font-medium leading-relaxed">
             Mantén tu racha de 12 días para desbloquear un <span className="font-black text-brand-energy">20% OFF</span> en toda la línea de nutrición CoachAI.
           </p>
        </div>
      </div>
    </motion.div>
  );
}

function SettingsView({ 
  stats, 
  onUpgrade, 
  onUpdate,
  googleUser,
  googleToken,
  isSyncingSheets,
  onConnectSheets,
  onCreateSheet,
  onSyncSheets,
  onDisconnectSheets,
  onReset,
  customSheetUrl,
  onChangeSheetUrl,
  onAnalyzeSheet,
  isAnalyzingSheet,
  importedHeaders,
  importedRows,
  onLinkRowProfile,
  selectedSheetRowIndex,
  mapImportedRowToProfile
}: any) {
  const isPremium = stats.tier === 'PREMIUM';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-12 pb-20">
      <div className="space-y-2 text-center md:text-left">
        <h3 className="text-4xl font-black italic tracking-tighter uppercase text-slate-900 underline decoration-slate-100 decoration-[12px] underline-offset-8">Panel de Control.</h3>
        <p className="text-slate-400 font-bold text-[10px] font-mono uppercase tracking-[0.2em]">Configuración del sistema e identidad del atleta</p>
      </div>
 
      <div className="space-y-10">
        <div className="bg-slate-900 rounded-[48px] p-12 flex flex-col md:flex-row items-center gap-10 border border-slate-800 justify-between relative overflow-hidden shadow-2xl shadow-slate-900/20">
          <div className="absolute right-0 top-0 bottom-0 w-48 bg-gradient-to-l from-brand-blue/20 to-transparent pointer-events-none" />
          <div className="flex items-center gap-8 text-center md:text-left flex-col md:flex-row relative z-10">
            <div className={`w-24 h-24 rounded-[32px] flex items-center justify-center ${stats.tier === 'PREMIUM' ? 'bg-brand-energy text-white shadow-2xl shadow-brand-energy/20' : 'bg-white/10 text-white/40'}`}>
              <Crown size={48} className={stats.tier === 'PREMIUM' ? 'fill-current' : ''} />
            </div>
            <div className="space-y-2">
              <p className="font-black text-3xl italic tracking-tighter uppercase text-white leading-none">Status {stats.tier}</p>
              <p className="text-sm font-medium text-white/40">{stats.tier === 'PREMIUM' ? 'Todos los núcleos de IA están operativos' : 'Operando con hardware compartido'}</p>
            </div>
          </div>
          <button 
            onClick={onUpgrade}
            className="bg-brand-blue text-white px-12 py-5 rounded-[24px] font-black text-sm uppercase tracking-widest hover:bg-white hover:text-slate-900 transition-all shadow-2xl shadow-brand-blue/20 relative z-10"
          >
            {stats.tier === 'PREMIUM' ? 'Gestionar Membresía' : 'Acceso Ilimitado'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="bg-white border border-slate-100 rounded-[40px] p-10 space-y-8 shadow-xl shadow-slate-100/30">
              <h4 className="text-xl font-black italic tracking-tighter uppercase text-slate-900 flex items-center gap-3">
                 <UserIcon size={24} className="text-brand-blue" /> Perfil de Atleta
              </h4>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest font-mono">Identidad / Avatar URL</p>
                    <input 
                      type="text" 
                      value={stats.logoUrl || ''} 
                      onChange={(e) => onUpdate({ logoUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20 transition-all font-medium text-slate-900"
                    />
                 </div>
                 
                 <SettingsItem 
                    label="Nombre" 
                    value={stats.profile?.name || '--'}
                    onEdit={(val: string) => onUpdate({ profile: { ...stats.profile, name: val } })}
                 />
                 <SettingsItem 
                    label="Apellido" 
                    value={stats.profile?.lastName || '--'}
                    onEdit={(val: string) => onUpdate({ profile: { ...stats.profile, lastName: val } })}
                 />
                 <SettingsItem 
                    label="Peso Actual" 
                    value={`${stats.weight}kg`}
                    onEdit={(val: string) => onUpdate({ weight: parseFloat(val) || stats.weight })}
                 />
                 <SettingsItem 
                    label="Meta Estratégica" 
                    value={stats.goal}
                    onEdit={(val: string) => onUpdate({ goal: val })}
                 />
                 <SettingsItem 
                    label="Edad" 
                    value={`${stats.profile?.age || '--'} años`}
                    onEdit={(val: string) => onUpdate({ profile: { ...stats.profile, age: parseInt(val) || stats.profile?.age } })}
                 />
                 <SettingsItem 
                    label="Altura" 
                    value={`${stats.profile?.height || '--'} cm`}
                    onEdit={(val: string) => onUpdate({ profile: { ...stats.profile, height: parseInt(val) || stats.profile?.height } })}
                 />
                 <SettingsItem 
                    label="Disciplina" 
                    value={stats.profile?.sport || 'No definido'}
                    onEdit={(val: string) => onUpdate({ profile: { ...stats.profile, sport: val } })}
                 />
              </div>
           </div>
           
           <div className="bg-white border border-slate-100 rounded-[40px] p-10 space-y-8 shadow-xl shadow-slate-100/30">
              <h4 className="text-xl font-black italic tracking-tighter uppercase text-slate-900 flex items-center gap-3">
                 <Zap size={24} className="text-brand-energy" /> Conectividad
              </h4>
              <div className="space-y-8">
                 <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                    <div className="space-y-1">
                       <p className="font-black italic tracking-tighter uppercase text-slate-900">Sincronización</p>
                       <p className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-widest">Wearable Activo</p>
                    </div>
                    <SettingsToggle 
                     active={stats.device?.isConnected} 
                     onToggle={(val: boolean) => onUpdate({ device: { ...stats.device, isConnected: val, hasDevice: val } })} 
                    />
                 </div>

                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest font-mono">Integraciones Externas</p>
                    <div className="grid grid-cols-2 gap-3">
                       <IntegrationButton label="Google Fit" connected={true} />
                       <IntegrationButton label="Strava" connected={false} />
                       <IntegrationButton label="Apple Health" connected={false} />
                       <IntegrationButton label="MyFitnessPal" connected={false} />
                    </div>
                 </div>
              </div>
           </div>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-[48px] p-12 space-y-10 group hover:border-brand-blue transition-all">
           <div className="flex items-center justify-between">
              <h4 className="text-2xl font-black italic tracking-tighter uppercase text-slate-900 flex items-center gap-3">
                 <Dumbbell size={28} className="text-brand-green" /> Mi Plan de Poder
              </h4>
              <div className="bg-brand-green/10 text-brand-green px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">IA Scanner Ready</div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-6">
                 <SettingsItem 
                    label="Frecuencia Semanal" 
                    value={stats.training?.frequency || 'No definido'} 
                    onEdit={(val: string) => onUpdate({ training: { ...stats.training, frequency: val } })}
                 />
                 <SettingsItem 
                    label="Tipo de Entrenamiento" 
                    value={stats.training?.type || 'No definido'} 
                    onEdit={(val: string) => onUpdate({ training: { ...stats.training, type: val } })}
                 />
              </div>
              
              <div className="md:col-span-2 space-y-6">
                 <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest font-mono">Carga de Documentación</p>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button className="flex flex-col items-center justify-center p-10 rounded-[32px] bg-white border-2 border-slate-100 border-dashed hover:border-brand-blue hover:bg-white transition-all group">
                       <Plus size={32} className="text-slate-200 group-hover:text-brand-blue" />
                       <span className="text-xs font-black mt-4 uppercase tracking-widest">Subir Rutina PDF</span>
                    </button>
                    <button className="flex flex-col items-center justify-center p-10 rounded-[32px] bg-white border-2 border-slate-100 border-dashed hover:border-brand-blue hover:bg-white transition-all group">
                       <Plus size={32} className="text-slate-200 group-hover:text-brand-blue" />
                       <span className="text-xs font-black mt-4 uppercase tracking-widest">Capturar Foto</span>
                    </button>
                 </div>
                 {isPremium && (
                   <div className="bg-brand-blue/5 border border-brand-blue/10 p-6 rounded-3xl flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-brand-blue flex items-center justify-center text-white">
                         <Bot size={20} />
                      </div>
                      <p className="text-xs text-slate-600 font-bold leading-relaxed uppercase tracking-tight">El motor de IA analizará tu archivo y optimizará tu plan dinámico.</p>
                   </div>
                 )}
              </div>
           </div>
        </div>
 
          {/* Google Sheets Integration Section */}
          <div className="bg-white border border-slate-100 rounded-[48px] p-12 space-y-10 shadow-xl shadow-slate-101/30">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="flex items-center gap-4">
                   <div className="w-14 h-14 bg-brand-green/10 text-brand-green rounded-2xl flex items-center justify-center flex-shrink-0">
                      <Database size={28} />
                   </div>
                   <div>
                      <h4 className="text-2xl font-black italic tracking-tighter uppercase text-slate-900">Planilla General de Atletas</h4>
                      <p className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-widest leading-none">Los datos de todos los atletas se unifican en la planilla central oficial</p>
                   </div>
                </div>
                <div className="px-4 py-1.5 bg-brand-green/10 text-brand-green border border-brand-green/10 rounded-full text-[10px] font-black uppercase tracking-widest font-mono font-bold">
                   Sincronización Directa Activa
                </div>
             </div>

             <div className="p-10 bg-brand-blue/[0.03] border border-brand-blue/10 rounded-[32px] space-y-8 relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-brand-blue/[0.03] to-transparent pointer-events-none" />
                <div className="flex flex-col md:flex-row justify-between items-start gap-6 relative z-10">
                   <div className="space-y-4">
                      <p className="text-[10px] font-black font-mono text-brand-blue uppercase tracking-[0.2em] leading-none">Status de Enlace</p>
                      <h5 className="font-black italic uppercase tracking-tighter text-2xl text-slate-900 leading-tight">Canal de Datos CoachAI Unificado</h5>
                      <p className="text-xs text-slate-500 font-bold leading-relaxed max-w-2xl">
                         Cada vez que completas tu onboarding, actualizas tu plan, chateas con tu Coach IA, o presionas el botón de sincronización, tus datos se reportan al instante a la planilla centralizada general.
                      </p>
                      {stats.lastSyncTime && (
                         <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mt-1 bg-white/60 w-fit px-3 py-1 rounded-full border border-slate-100">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                            Último reporte exitoso: {stats.lastSyncTime}
                         </div>
                      )}
                   </div>
                </div>

                <div className="flex gap-4 relative z-10 pt-2">
                   <button
                      onClick={onSyncSheets}
                      disabled={isSyncingSheets}
                      className="px-8 py-4 bg-brand-blue hover:bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-blue/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                   >
                      {isSyncingSheets ? (
                         <RefreshCw size={14} className="animate-spin" />
                      ) : (
                         <RefreshCw size={14} />
                      )}
                      Sincronizar mis Métricas Ahora
                   </button>
                </div>
             </div>
          </div>

          {/* Planilla Personal de Google Sheets Section */}
          <div className="bg-white border border-slate-100 rounded-[48px] p-12 space-y-10 shadow-xl shadow-slate-100/30">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="flex items-center gap-4">
                   <div className="w-14 h-14 bg-brand-blue/10 text-brand-blue rounded-2xl flex items-center justify-center flex-shrink-0">
                      <Database size={28} />
                   </div>
                   <div>
                      <h4 className="text-2xl font-black italic tracking-tighter uppercase text-slate-900 font-sans">Planilla Personal de Google Sheets</h4>
                      <p className="text-[10px] text-slate-400 uppercase font-mono font-bold tracking-widest leading-none">Vincula tu cuenta de Google y visualiza tus métricas en tu planilla personal</p>
                   </div>
                </div>
                {googleUser ? (
                  <div className="px-4 py-1.5 bg-brand-green/10 text-brand-green border border-brand-green/10 rounded-full text-[10px] font-black uppercase tracking-widest font-mono font-bold flex items-center gap-1.5 select-none">
                     <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                     Google Conectado ({googleUser.email})
                  </div>
                ) : (
                  <div className="px-4 py-1.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-widest font-mono font-bold select-none">
                     No Conectado
                  </div>
                )}
             </div>

             <div className="p-10 bg-slate-50 border border-slate-100 rounded-[32px] space-y-8 relative overflow-hidden">
                <div className="space-y-6">
                   {!googleUser ? (
                      <div className="space-y-4">
                         <p className="text-xs text-slate-500 font-bold leading-relaxed font-sans">
                            Vincula tu cuenta de Google para sincronizar automáticamente tus entrenamientos y progreso físico. Esto creará o actualizará las hojas de "Resumen Atletico" y "Registro de Entrenamientos" en tu planilla.
                         </p>
                         <button
                            onClick={onConnectSheets}
                            className="px-8 py-4 bg-brand-blue hover:bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-brand-blue/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 cursor-pointer"
                         >
                            <Database size={14} /> Conectar cuenta de Google
                         </button>
                      </div>
                   ) : (
                      <div className="space-y-6">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 tracking-widest font-mono uppercase">URL o ID de Planilla de Google Sheets</label>
                            <div className="flex gap-3">
                               <input 
                                 type="text" 
                                 value={customSheetUrl} 
                                 onChange={(e) => onChangeSheetUrl(e.target.value)}
                                 placeholder="https://docs.google.com/spreadsheets/d/..."
                                 className="flex-1 bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20 transition-all font-sans font-medium text-slate-900"
                               />
                               <button
                                 onClick={onAnalyzeSheet}
                                 disabled={isAnalyzingSheet}
                                 className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-brand-blue transition-all disabled:opacity-50 cursor-pointer"
                               >
                                 {isAnalyzingSheet ? "Enlazando..." : "Enlazar y Validar"}
                               </button>
                            </div>
                         </div>

                         {stats.linkedSheetUrl && (
                            <div className="p-4 bg-white border border-slate-150 rounded-2xl flex items-center justify-between text-xs font-sans">
                               <div className="truncate pr-4">
                                  <p className="font-bold text-[10px] text-slate-300 uppercase tracking-widest font-mono">Planilla Vinculada</p>
                                  <a href={stats.linkedSheetUrl} target="_blank" rel="noopener noreferrer" className="text-brand-blue font-black hover:underline truncate block">
                                     {stats.linkedSheetUrl}
                                  </a>
                               </div>
                               <div className="flex-shrink-0 text-brand-green font-black uppercase text-[10px] tracking-widest bg-brand-green/10 px-3 py-1 rounded-full border border-brand-green/10 font-mono">
                                  ACTIVA
                                </div>
                            </div>
                         )}

                         <div className="flex flex-wrap gap-4 pt-2">
                            <button
                               onClick={onCreateSheet}
                               disabled={isSyncingSheets}
                               className="px-6 py-4 bg-white border border-slate-250 text-slate-800 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                               Crear nueva Planilla Automática
                            </button>
                            
                            <button
                               onClick={onDisconnectSheets}
                               className="px-6 py-4 bg-rose-50 text-rose-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-2 cursor-pointer ml-auto"
                            >
                               Desconectar Google
                            </button>
                         </div>
                      </div>
                   )}
                </div>
             </div>
          </div>

<div className="p-8 border-2 border-slate-100 rounded-[32px] flex items-center justify-between opacity-50 hover:opacity-100 transition-all text-slate-400">
           <div>
              <p className="font-black text-slate-900 uppercase italic tracking-tighter">Zona de Seguridad</p>
              <p className="text-xs font-medium">Borrado permanente de datos del sistema CoachAI.</p>
           </div>
           <button 
              onClick={onReset}
              className="text-xs font-black hover:text-red-500 underline uppercase tracking-widest cursor-pointer"
           >
              Resetear Perfil
           </button>
        </div>
      </div>
    </motion.div>
  );
}

function SettingsItem({ label, value, onEdit }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value);

  return (
    <div className="space-y-2 p-1">
      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest font-mono">{label}</p>
      <div className="flex items-center justify-between group">
        {isEditing ? (
          <input 
            autoFocus
            type="text"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => {
              setIsEditing(false);
              onEdit(val);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditing(false);
                onEdit(val);
              }
            }}
            className="bg-transparent border-b-2 border-brand-blue outline-none text-slate-900 font-black italic text-xl uppercase w-full"
          />
        ) : (
          <span className="font-black italic text-xl uppercase text-slate-900 tracking-tighter truncate pr-4 leading-none">{value}</span>
        )}
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-brand-blue hover:bg-brand-blue hover:text-white transition-all shadow-sm"
        >
          {isEditing ? <CheckCircle2 size={16} /> : <Pencil size={14} />}
        </button>
      </div>
    </div>
  );
}

function SettingsToggle({ active, onToggle }: any) {
  return (
    <button 
      onClick={() => onToggle(!active)}
      className={`w-14 h-7 rounded-full p-1 transition-all ${active ? 'bg-brand-green' : 'bg-slate-200'}`}
    >
      <div className={`w-5 h-5 bg-white rounded-full transition-all shadow-md ${active ? 'translate-x-7' : 'translate-x-0'}`} />
    </button>
  );
}

function IntegrationButton({ label, connected }: { label: string, connected: boolean }) {
  return (
    <button className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${connected ? 'bg-white border-brand-green/20 text-brand-green' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-brand-blue'}`}>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      {connected ? <CheckCircle2 size={14} /> : <ArrowRight size={14} />}
    </button>
  );
}
