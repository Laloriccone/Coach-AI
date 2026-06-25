import React from 'react';

interface LogoProps {
  className?: string;
  src?: string;
}

export default function Logo({ className = "w-10 h-10", src }: LogoProps) {
  const defaultLogo = "https://api.dicebear.com/7.x/shapes/svg?seed=CoachAI&backgroundColor=a3e635";
  
  return (
    <div className={`${className} rounded-xl bg-lime-400 flex items-center justify-center shrink-0 shadow-lg shadow-lime-400/20 overflow-hidden`}>
      <img 
        src={src || defaultLogo} 
        alt="CoachAI Logo"
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
