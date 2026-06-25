import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserStats, UserType, Message } from '../types';
import { 
  ChevronRight, Target, Activity, Zap, Bot, Send, 
  Dumbbell, Trophy, Utensils, Moon, Flame, Brain, ArrowRight,
  Sparkles, CheckCircle2, HelpCircle, AlertCircle, User as UserIcon
} from 'lucide-react';
import { getCoachResponse } from '../services/geminiService';

interface OnboardingProps {
  userType: UserType;
  logoUrl?: string;
  onComplete: (stats: Partial<UserStats>) => void;
}

const QUESTIONS = [
  {
    id: 'name',
    title: "¿Cuál es tu nombre?",
    subtitle: "Personalizaremos nuestro trato y tu tablero oficial de atleta.",
    type: 'text',
    placeholder: "Ej: Juan"
  },
  {
    id: 'lastName',
    title: "¿Cuál es tu apellido?",
    subtitle: "Para el registro formal de tus planillas y reportes.",
    type: 'text',
    placeholder: "Ej: Pérez"
  },
  {
    id: 'sport',
    title: "¿Qué deporte o actividad haces principalmente?",
    subtitle: "Personalizaremos tus métricas base según tu disciplina.",
    type: 'visual',
    options: [
      { id: 'gym', label: 'Gym', icon: <Dumbbell size={24} /> },
      { id: 'futbol', label: 'Fútbol', icon: <Activity size={24} /> },
      { id: 'running', label: 'Running', icon: <Flame size={24} /> },
      { id: 'basket', label: 'Básquetbol', icon: <Trophy size={24} /> },
      { id: 'tennis', label: 'Tenis', icon: <Activity size={24} /> },
      { id: 'crossfit', label: 'Crossfit', icon: <Zap size={24} /> },
      { id: 'cycling', label: 'Ciclismo', icon: <Activity size={24} /> },
      { id: 'natacion', label: 'Natación', icon: <Activity size={24} /> },
      { id: 'otro', label: 'Otro', icon: <Plus size={24} /> },
    ]
  },
  {
    id: 'frequency',
    title: "¿Con qué frecuencia entrenas?",
    subtitle: "Esto define tu volumen de carga semanal.",
    type: 'select',
    options: ['1–2 veces por semana', '3–4 veces por semana', '5–6 veces por semana', 'Todos los días']
  },
  {
    id: 'duration',
    title: "¿Cuánto dura normalmente cada entrenamiento?",
    subtitle: "Ajustaremos los intervalos de análisis.",
    type: 'select',
    options: ['Menos de 1 hora', '1 hora', '2 horas', 'Más de 2 horas']
  },
  {
    id: 'rest',
    title: "¿Cómo consideras tu descanso?",
    subtitle: "El sueño es el motor de la recuperación.",
    type: 'select',
    options: ['Muy bueno', 'Bueno', 'Regular', 'Malo']
  },
  {
    id: 'nutrition',
    title: "¿Cómo consideras tu alimentación?",
    subtitle: "Tu combustible determina tu potencia.",
    type: 'select',
    options: ['Muy buena', 'Buena', 'Regular', 'Mala']
  },
  {
    id: 'goal',
    title: "¿Cuál es tu principal objetivo?",
    subtitle: "Enfocaremos el motor de IA en este norte.",
    type: 'select',
    options: ['Ganar masa muscular', 'Mejorar rendimiento', 'Bajar grasa', 'Tener más disciplina', 'Dormir mejor', 'Mejorar recuperación', 'Otro']
  },
  {
    id: 'struggle',
    title: "¿Qué es lo que más te cuesta actualmente?",
    subtitle: "Identificamos tus puntos ciegos para atacarlos.",
    type: 'select',
    options: ['Constancia', 'Alimentación', 'Sueño', 'Motivación', 'Organización', 'Recuperación']
  },
  {
    id: 'age',
    title: "¿Cuál es tu edad?",
    subtitle: "Ajustaremos los umbrales de intensidad según tu etapa biológica.",
    type: 'input',
    placeholder: "Ej: 25"
  },
  {
    id: 'weight',
    title: "¿Cuál es tu peso actual?",
    subtitle: "Fundamental para calcular tus macros y vatios.",
    type: 'input',
    placeholder: "Ej: 75 (kg)"
  },
  {
    id: 'height',
    title: "¿Cuál es tu altura?",
    subtitle: "Calcularemos tu índice de masa y superficie corporal.",
    type: 'input',
    placeholder: "Ej: 180 (cm)"
  }
];

export default function Onboarding({ userType, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(-1); // -1 = Welcome, 0-6 = Questions, 7 = Profile Generation
  const [formData, setFormData] = useState<any>({});
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Premium conversational state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isPremium = userType === 'PREMIUM';
  const progress = step === -1 ? 0 : step >= QUESTIONS.length ? 100 : ((step + 1) / QUESTIONS.length) * 100;

  const handleNext = (value: string) => {
    const currentQuestion = QUESTIONS[step];
    const newFormData = { ...formData, [currentQuestion.id]: value };
    setFormData(newFormData);

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      generateProfile();
    }
  };

  const generateProfile = async () => {
    if (isPremium) {
       setStep(QUESTIONS.length); // Move to conversational step
    } else {
       setStep(QUESTIONS.length + 1); // Skip to generation
       setIsGenerating(true);
       setTimeout(() => setIsGenerating(false), 3000);
    }
  };

  const handlePremiumFinish = () => {
    setStep(QUESTIONS.length + 1);
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 3000);
  };

  const handleSendPremium = async () => {
    if (!inputValue.trim() || isLoading) return;
    const msg = inputValue;
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: Date.now() }]);
    setIsLoading(true);

    try {
      const response = await getCoachResponse(msg, messages, 'PREMIUM', true, formData);
      setMessages(prev => [...prev, { role: 'model', content: response, timestamp: Date.now() }]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (step === QUESTIONS.length && isPremium && messages.length === 0) {
      setMessages([{
        role: 'model',
        content: `Increíble, **${formData.name || 'Atleta'}**. Como atleta Premium, quiero profundizar. Noto que tu objetivo es ${formData.goal} y que te cuesta la ${formData.struggle}. ¿Hay algo específico sobre tus lesiones pasadas o preferencias de equipo que deba saber para optimizar tu carga al 100%?`,
        timestamp: Date.now()
      }]);
    }
  }, [step, isPremium]);

  const handleFinish = () => {
    onComplete({
      isOnboarded: true,
      goal: formData.goal,
      weight: parseFloat(formData.weight) || 75,
      nombre: `${formData.name || ""} ${formData.lastName || ""}`.trim(),
      profile: {
        name: formData.name || '',
        lastName: formData.lastName || '',
        sport: formData.sport,
        frequency: formData.frequency,
        age: parseInt(formData.age) || 25,
        height: parseInt(formData.height) || 175,
      },
      training: {
        frequency: formData.frequency,
        type: formData.sport
      }
    });
  };

  if (step === -1) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-slate-900 font-sans overflow-hidden">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xl w-full text-center space-y-10"
        >
          <div className="w-20 h-20 bg-brand-blue rounded-[32px] flex items-center justify-center text-white mx-auto shadow-2xl shadow-brand-blue/20">
            <Bot size={40} />
          </div>
          <div className="space-y-4">
             <h1 className="text-5xl md:text-6xl font-black italic tracking-tighter uppercase leading-[0.85]">
                Bienvenido al <br />
                <span className="text-brand-blue underline decoration-brand-energy decoration-[12px] underline-offset-8">Sistema.</span>
             </h1>
             <p className="text-slate-500 font-medium text-lg max-w-sm mx-auto leading-relaxed">
                Antes de iniciar, necesito entender tu biología y ritmo actual para calibrar mi motor de IA.
             </p>
          </div>

          <button 
            onClick={() => setStep(0)}
            className="w-full bg-slate-900 text-white p-6 rounded-[32px] font-black text-xl uppercase italic tracking-tighter hover:bg-brand-blue transition-all shadow-2xl shadow-slate-900/10 flex items-center justify-center gap-3 group"
          >
            Iniciar Calibración <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
          </button>

          <div className="flex items-center justify-center gap-4 text-slate-300 font-bold text-[10px] uppercase tracking-widest font-mono">
             <Sparkles size={14} className="text-brand-energy" /> Personalización en tiempo real activa
          </div>
        </motion.div>
      </div>
    );
  }

  // Premium Conversational Phase
  if (step === QUESTIONS.length && isPremium) {
    return (
      <div className="min-h-screen bg-white flex flex-col p-6 text-slate-900 font-sans">
        <div className="max-w-4xl mx-auto w-full h-full flex flex-col pt-10">
           <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-3">
                 <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl">
                    <Zap size={24} className="fill-brand-energy text-brand-energy" />
                 </div>
                 <div>
                    <h3 className="font-black italic uppercase tracking-tighter text-slate-900 leading-none">Sesión Premium</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Profundizando en tu ADN de Rendimiento</p>
                 </div>
              </div>
              <button 
                onClick={handlePremiumFinish}
                className="text-[10px] font-black text-white bg-brand-green px-6 py-3 rounded-full uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-brand-green/20"
              >
                Finalizar Configuración
              </button>
           </div>

           <div className="flex-1 bg-slate-50 rounded-[48px] p-8 md:p-12 overflow-hidden flex flex-col shadow-inner border border-slate-100">
              <div className="flex-1 overflow-y-auto space-y-8 pr-4 custom-scrollbar" ref={scrollRef}>
                {messages.map((msg, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-6 ${msg.role === 'user' ? 'flex-row-reverse text-right' : ''}`}
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-1 shadow-sm ${msg.role === 'user' ? 'bg-white text-slate-400' : 'bg-slate-900 text-brand-energy'}`}>
                      {msg.role === 'user' ? <UserIcon size={18} /> : <Bot size={18} />}
                    </div>
                    <div className="space-y-1 max-w-[80%]">
                      <div className={`text-base font-medium leading-relaxed ${msg.role === 'user' ? 'text-slate-500' : 'text-slate-900'}`}>
                        {msg.content}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex gap-6">
                    <div className="w-10 h-10 rounded-2xl bg-slate-900 text-brand-energy flex items-center justify-center animate-pulse">
                      <Bot size={18} />
                    </div>
                    <div className="flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-brand-blue rounded-full animate-bounce" />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 relative group">
                <input 
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendPremium()}
                  placeholder="Escribe aquí... (lesiones, equipo disponible, miedos...)"
                  className="w-full bg-white border border-slate-200 rounded-[32px] py-8 px-10 text-lg focus:outline-none focus:ring-4 focus:ring-brand-blue/10 transition-all shadow-xl shadow-slate-200/50"
                />
                <button 
                  onClick={handleSendPremium}
                  disabled={isLoading || !inputValue.trim()}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-16 h-16 rounded-3xl bg-brand-blue flex items-center justify-center text-white shadow-2xl shadow-brand-blue/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-30"
                >
                  <Send size={24} />
                </button>
              </div>
           </div>
        </div>
      </div>
    );
  }

  // Final Summary / Profile Generation
  if (step === QUESTIONS.length + 1 || (step === QUESTIONS.length && !isPremium)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-900 font-sans">
        <div className="max-w-2xl w-full">
          <AnimatePresence mode="wait">
            {isGenerating ? (
              <motion.div 
                key="generating"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center space-y-12"
              >
                <div className="relative">
                  <div className="w-32 h-32 border-4 border-slate-100 border-t-brand-blue rounded-full animate-spin mx-auto" />
                  <div className="absolute inset-0 flex items-center justify-center text-brand-blue">
                     <Brain size={40} className="animate-pulse" />
                  </div>
                </div>
                <div className="space-y-4">
                  <h2 className="text-4xl font-black italic tracking-tighter uppercase">Generando Perfil...</h2>
                  <p className="text-slate-400 font-mono text-[10px] uppercase tracking-widest font-bold">Analizando patrones de {formData.sport} • {formData.goal}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                   {[
                     'Ajustando vatios metabólicos',
                     'Sincronizando ciclos de recuperación',
                     'Configurando motor predictivo'
                   ].map((t, i) => (
                     <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 flex items-center gap-3">
                        <CheckCircle2 size={16} className="text-brand-green" />
                        <span className="text-[10px] font-black uppercase text-slate-500 font-mono text-center">{t}</span>
                     </div>
                   ))}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="summary"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-10"
              >
                <div className="text-center space-y-2">
                   <div className="bg-brand-green/10 text-brand-green px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest inline-block border border-brand-green/20">Calibración Exitosa</div>
                   <h2 className="text-5xl font-black italic tracking-tighter uppercase text-slate-900">Perfil de Atleta.</h2>
                </div>

                <div className="bg-white rounded-[48px] p-12 shadow-2xl shadow-slate-200 border border-slate-100 space-y-10 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
                      <Bot size={200} />
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                      <SummaryCard label="Atleta" value={`${formData.name || ''} ${formData.lastName || ''}`} icon={<UserIcon size={20} />} />
                      <SummaryCard label="Disciplina Principal" value={formData.sport} icon={<Dumbbell size={20} />} />
                      <SummaryCard label="Misión Estratégica" value={formData.goal} icon={<Target size={20} />} />
                      <SummaryCard label="Bio Perfil" value={`${formData.age} años • ${formData.weight}kg • ${formData.height}cm`} icon={<Activity size={20} />} />
                      <SummaryCard label="Ritmo de Vida" value={formData.frequency} icon={<Activity size={20} />} />
                      <SummaryCard label="Punto Crítico" value={formData.struggle} icon={<Activity size={20} />} />
                   </div>

                   <div className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 space-y-4">
                      <div className="flex items-center gap-2">
                         <Sparkles size={16} className="text-brand-energy" />
                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">IA Insight Inicial</span>
                      </div>
                      <p className="text-slate-600 font-medium leading-relaxed italic">
                         "Basado en tu enfoque en <span className="text-brand-blue font-bold">{formData.sport}</span> y tu dificultad con la <span className="text-brand-blue font-bold">{formData.struggle}</span>, he ajustado tus notificaciones para actuar como un ancla de disciplina. Tu descanso es <span className="text-brand-blue font-bold">{formData.rest}</span>, por lo que priorizaremos la higiene del sueño esta semana."
                      </p>
                   </div>
                </div>

                <button 
                  onClick={handleFinish}
                  className="w-full bg-slate-900 text-white p-8 rounded-[40px] font-black text-2xl uppercase italic tracking-tighter hover:bg-brand-green transition-all shadow-2xl shadow-slate-900/10 flex items-center justify-center gap-4 group"
                >
                  Entrar al Sistema <ArrowRight size={32} className="group-hover:translate-x-2 transition-transform" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  const currentQ = QUESTIONS[step];

  return (
    <div className="min-h-screen bg-white flex flex-col p-6 text-slate-900 font-sans overflow-hidden">
      {/* Progress Header */}
      <div className="max-w-5xl mx-auto w-full pt-10 pb-20">
         <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-brand-blue rounded-xl flex items-center justify-center text-white">
                  <Bot size={24} />
               </div>
               <div>
                  <h3 className="font-black italic uppercase tracking-tighter text-brand-blue leading-none">Calibración</h3>
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest font-mono">Paso {step + 1} de {QUESTIONS.length}</p>
               </div>
            </div>
            {step > 0 && (
              <button 
                onClick={() => setStep(step - 1)}
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors"
              >
                Anterior
              </button>
            )}
         </div>
         <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden p-0.5 border border-slate-100">
            <motion.div 
               className="h-full bg-brand-blue rounded-full"
               initial={{ width: 0 }}
               animate={{ width: `${progress}%` }}
               transition={{ type: 'spring', damping: 20 }}
            />
         </div>
      </div>

      <div className="flex-1 flex items-center justify-center w-full">
         <div className="max-w-4xl w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 50, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: -50, filter: 'blur(10px)' }}
                className="space-y-12"
              >
                <div className="space-y-4 text-center md:text-left">
                   <h2 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase text-slate-900 underline decoration-slate-100 decoration-[16px] underline-offset-8">
                      {currentQ.title}
                   </h2>
                   <p className="text-xl text-slate-400 font-medium italic flex items-center justify-center md:justify-start gap-3">
                      <HelpCircle size={20} className="text-brand-blue opacity-50" /> {currentQ.subtitle}
                   </p>
                </div>

                {currentQ.type === 'visual' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {currentQ.options.map((opt: any) => (
                      <button
                        key={opt.id}
                        onClick={() => {
                          if (opt.id === 'otro') {
                            const val = prompt('¿Qué deporte haces?') || '';
                            if (val) handleNext(val);
                          } else {
                            handleNext(opt.label);
                          }
                        }}
                        className="bg-slate-50 border-2 border-slate-100 p-8 rounded-[40px] flex flex-col items-center justify-center gap-6 hover:border-brand-blue hover:bg-white hover:shadow-2xl hover:shadow-brand-blue/5 transition-all group group"
                      >
                        <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-slate-400 group-hover:bg-brand-blue group-hover:text-white transition-all shadow-sm">
                           {opt.icon}
                        </div>
                        <span className="font-black italic uppercase tracking-tighter text-xl text-slate-900">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                ) : currentQ.type === 'text' ? (
                   <div className="max-w-xl mx-auto md:mx-0 space-y-8">
                      <input 
                        type="text"
                        placeholder={currentQ.placeholder}
                        defaultValue={formData[currentQ.id] || ''}
                        className="w-full bg-slate-50 border-4 border-slate-100 rounded-[32px] p-8 text-3xl font-black italic uppercase tracking-tighter focus:border-brand-blue focus:bg-white outline-none transition-all"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            if (val) handleNext(val);
                          }
                        }}
                      />
                      <button 
                        onClick={(e) => {
                          const input = (e.currentTarget.previousSibling as HTMLInputElement);
                          if (input.value) handleNext(input.value);
                        }}
                        className="w-full bg-slate-900 text-white p-6 rounded-[32px] font-black text-xl uppercase italic tracking-tighter hover:bg-brand-blue transition-all flex items-center justify-center gap-3 group"
                      >
                        Continuar <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
                      </button>
                   </div>
                ) : currentQ.type === 'input' ? (
                   <div className="max-w-xl mx-auto md:mx-0 space-y-8">
                      <input 
                        type="number"
                        placeholder={currentQ.placeholder}
                        defaultValue={formData[currentQ.id] || ''}
                        className="w-full bg-slate-50 border-4 border-slate-100 rounded-[32px] p-8 text-3xl font-black italic uppercase tracking-tighter focus:border-brand-blue focus:bg-white outline-none transition-all"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            if (val) handleNext(val);
                          }
                        }}
                      />
                      <button 
                        onClick={(e) => {
                          const input = (e.currentTarget.previousSibling as HTMLInputElement);
                          if (input.value) handleNext(input.value);
                        }}
                        className="w-full bg-slate-900 text-white p-6 rounded-[32px] font-black text-xl uppercase italic tracking-tighter hover:bg-brand-blue transition-all flex items-center justify-center gap-3 group"
                      >
                        Continuar <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
                      </button>
                   </div>
                ) : (
                  <div className="flex flex-col gap-4 max-w-xl mx-auto md:mx-0">
                    {currentQ.options?.map((opt: any) => (
                      <button
                        key={typeof opt === 'string' ? opt : opt.id}
                        onClick={() => {
                          const val = typeof opt === 'string' ? opt : opt.label;
                          if (val === 'Otro') {
                             const userVal = prompt('Cuéntanos más:') || '';
                             if (userVal) handleNext(userVal);
                          } else {
                             handleNext(val);
                          }
                        }}
                        className="w-full text-left p-8 rounded-[32px] bg-slate-50 border-2 border-slate-100 hover:border-brand-blue hover:bg-white hover:shadow-xl hover:shadow-brand-blue/5 transition-all flex items-center justify-between group"
                      >
                        <span className="text-xl font-black italic uppercase tracking-tighter text-slate-900">{typeof opt === 'string' ? opt : opt.label}</span>
                        <ChevronRight size={24} className="text-slate-300 group-hover:text-brand-blue group-hover:translate-x-2 transition-all" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
         </div>
      </div>

      <div className="text-center py-10 opacity-30 text-[10px] font-mono font-black uppercase tracking-[0.5em]">
         CoachAI Performance System • v2.1
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
   return (
      <div className="space-y-4">
         <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
               {icon}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 font-mono">{label}</span>
         </div>
         <p className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 leading-none">{value}</p>
      </div>
   );
}

function Plus({ size, className }: any) {
   return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M5 12h14"/><path d="M12 5v14"/></svg>;
}
