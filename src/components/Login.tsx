import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ScanEye } from 'lucide-react';

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
        className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100"
      >
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
            <ScanEye className="h-8 w-8 text-white" strokeWidth={1.5} />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">HawkEye</h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-widest text-gray-400">Auditoría Inteligente</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-lg tracking-widest text-gray-900 transition-colors focus:border-gray-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
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
            className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            Ingresar
          </button>
        </form>
        
        <div className="mt-8 text-center">
          <p className="text-[8px] font-medium uppercase tracking-widest text-gray-400/70">Built by PascaTech</p>
        </div>
      </motion.div>
    </div>
  );
}
