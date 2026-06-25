import React from 'react';
import { motion } from 'motion/react';
import { Crown, Check, Zap, ArrowRight, Star } from 'lucide-react';
import { UserType } from '../types';

interface PricingProps {
  onSelect: (type: 'FREE' | 'PREMIUM', sub: 'NONE' | 'MONTHLY' | 'ANNUAL') => void;
}

export default function Pricing({ onSelect }: PricingProps) {
  return (
    <div className="min-h-screen bg-white text-slate-900 p-6 md:p-12 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-12 pb-20">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-brand-blue/10 text-brand-blue px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase border border-brand-blue/20">
            <Star size={14} className="fill-current" /> 30 Días de Prueba Gratis Activa
          </div>
          <h1 className="text-4xl md:text-7xl font-black italic tracking-tighter uppercase text-slate-900 leading-none">Domina tu <br /> Rendimiento.</h1>
          <p className="text-slate-400 max-w-xl mx-auto font-medium">Potencia tu rendimiento con insights de IA, nutrición personalizada y el hardware de monitoreo más avanzado.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-stretch pt-10">
          {/* FREE PLAN */}
          <PricingCard 
            title="BÁSICO"
            price="0"
            description="Seguimiento de rendimiento funcional para entrenamiento casual."
            features={[
              "Recomendaciones de IA Básicas",
              "Log de Entrenamiento (7 días)",
              "Tips de Nutrición General",
              "Sistema de Niveles"
            ]}
            buttonText="Continuar Gratis"
            onClick={() => onSelect('FREE', 'NONE')}
          />

          {/* PREMIUM PLAN */}
          <PricingCard 
            title="PREMIUM ELITE"
            price="14.99"
            description="La experiencia definitiva. Hardware y software en simbiosis total."
            highlight
            features={[
              "CoachAI Watch S1 (GRATIS INCLUIDO)",
              "Coaching Conversacional Ilimitado",
              "Análisis de Sueño y Recuperación Bio-Sync",
              "Planes de Entrenamiento Dinámicos",
              "Premios de Rendimiento Exclusivos",
              "Sincronización de Hardware Prioritaria"
            ]}
            buttonText="Iniciar Prueba Gratuita"
            onClick={() => onSelect('PREMIUM', 'MONTHLY')}
          />
        </div>

        <div className="text-center pt-16 space-y-6">
          <p className="text-slate-300 text-[10px] font-mono font-black uppercase tracking-[0.3em]">Política de Ecosistema</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-[32px] bg-slate-50 border border-slate-100 space-y-4">
              <h4 className="font-black italic uppercase tracking-tighter text-slate-900 text-xl">Mensual</h4>
              <p className="text-3xl font-black text-slate-900">$14.99<span className="text-xs text-slate-300 font-normal">/mes</span></p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Flexibilidad total</p>
            </div>
            <div className="p-8 rounded-[32px] bg-slate-900 text-white space-y-4 relative overflow-hidden shadow-2xl shadow-slate-900/20">
               <div className="absolute top-4 right-4 bg-brand-energy text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">AHORRA 20%</div>
              <h4 className="font-black italic uppercase tracking-tighter text-white text-xl">Anual</h4>
              <p className="text-3xl font-black text-white">$119.99<span className="text-xs text-white/40 font-normal">/año</span></p>
              <p className="text-xs text-brand-blue font-black uppercase tracking-widest">+ Reloj CoachAI Gratis</p>
            </div>
            <div className="p-8 rounded-[32px] bg-slate-50 border border-slate-100 space-y-4">
              <h4 className="font-black italic uppercase tracking-tighter text-slate-900 text-xl">Garantía</h4>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">Hardware reemplazable por desgaste de entrenamiento dentro del plan Premium.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PricingCard({ title, price, description, features, buttonText, onClick, highlight }: any) {
  return (
    <div className={`relative p-12 rounded-[48px] flex flex-col h-full border-2 transition-all ${highlight ? 'bg-white border-brand-blue text-slate-900 shadow-2xl shadow-brand-blue/10 scale-[1.02]' : 'bg-slate-50 border-slate-100 text-slate-900 hover:border-slate-200'}`}>
      <div className="space-y-6 mb-12">
        <div className="flex justify-between items-start">
           <h3 className="text-4xl font-black italic tracking-tighter uppercase leading-none">{title}</h3>
           {highlight && <Crown size={32} className="text-brand-energy fill-current" />}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-6xl font-black tracking-tighter">${price}</span>
          <span className="text-sm font-bold text-slate-300 uppercase font-mono">/mes</span>
        </div>
        <p className="text-base font-medium text-slate-500 leading-relaxed">{description}</p>
      </div>

      <div className="space-y-5 mb-14 flex-1">
        {features.map((f: string) => (
          <div key={f} className="flex items-start gap-4">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${highlight ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20' : 'bg-slate-200 text-slate-400'}`}>
              <Check size={14} strokeWidth={4} />
            </div>
            <span className={`text-sm font-bold uppercase tracking-tight ${f.includes('GRATIS') ? 'text-brand-energy' : 'text-slate-600'}`}>{f}</span>
          </div>
        ))}
      </div>

      <button 
        onClick={onClick}
        className={`w-full py-6 rounded-[28px] font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 group transition-all ${
          highlight 
          ? 'bg-slate-900 text-white hover:bg-brand-blue shadow-2xl shadow-slate-900/20 active:scale-95' 
          : 'bg-white text-slate-900 border-2 border-slate-100 hover:bg-slate-50 active:scale-95'
        }`}
      >
        {buttonText} <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
      </button>

      {highlight && (
        <div className="absolute -top-5 left-12 bg-brand-energy text-white px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-brand-energy/20">
          Recomendado
        </div>
      )}
    </div>
  );
}
