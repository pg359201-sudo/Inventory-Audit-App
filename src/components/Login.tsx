import React, { useState } from 'react';
import { motion } from 'motion/react';

interface LoginProps {
  onLogin: (role: 'auditor' | 'admin') => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '1234') {
      onLogin('auditor');
    } else if (password === '6995') {
      onLogin('admin');
    } else {
      setError('Código incorrecto');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100"
      >
        {/* Contenido principal */}
        <div className="relative z-10">
          <div className="mb-8 flex flex-col items-center">
            <motion.div 
              animate={{ 
                boxShadow: [
                  '0 0 0 0px rgba(17, 24, 39, 0.15)', 
                  '0 0 0 16px rgba(17, 24, 39, 0)'
                ] 
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
              className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="h-10 w-10 text-white"
              >
                {/* Scan Frame */}
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                {/* Bottle Outline */}
                <path d="M11 5h2v3h1a2 2 0 0 1 2 2v8H8v-8a2 2 0 0 1 2-2h1V5z" />
                {/* Diagonal Label */}
                <path d="M8 13l8-3" strokeWidth="0.75" />
                <path d="M8 16l8-3" strokeWidth="0.75" />
              </svg>
            </motion.div>
            <h1 className="text-2xl font-black tracking-tighter text-gray-900 uppercase">HawkEye</h1>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-gray-400">Auditoría Inteligente</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-3 max-w-[260px] mx-auto" autoComplete="off">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full h-12 rounded-xl border border-gray-200 bg-gray-50 px-4 text-center text-lg tracking-widest text-gray-900 transition-colors focus:border-gray-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
                placeholder="••••"
                autoComplete="off"
                name="password_fake"
                id="password_input"
                data-lpignore="true"
              />
            </div>
            {error && <p className="text-center text-sm font-medium text-red-500">{error}</p>}
            <button
              type="submit"
              className="w-full h-12 flex items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
            >
              Ingresar
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-[8px] font-medium uppercase tracking-widest text-gray-400/70">Built by PascaTech</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
