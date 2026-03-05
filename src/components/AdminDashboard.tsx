import React, { useEffect, useState } from 'react';
import { AuditResult } from '../types';
import { Download, Eye, ArrowLeft } from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [history, setHistory] = useState<AuditResult[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(data => setHistory(data))
      .catch(err => console.error('Error fetching history:', err));
  }, []);

  const handleExport = () => {
    // Generate CSV content
    const headers = ['ID', 'Usuario', 'Fecha', 'Cliente', 'Resultado Global', 'URL Imagen'];
    const rows = history.map(h => [
      h.id,
      h.usuario,
      h.fecha,
      h.cliente,
      h.resultado_global,
      window.location.origin + h.url_imagen
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'auditoria_historial.csv';
    link.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Panel de Administrador</h1>
          <div className="flex gap-4">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              <Download size={20} />
              Descargar Historial
            </button>
            <button onClick={onLogout} className="text-gray-600 hover:text-gray-900">Salir</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Usuario</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Resultado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {history.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {new Date(item.fecha).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      Auditor {item.usuario}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {item.cliente}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        item.resultado_global === 'OK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {item.resultado_global}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                      <button
                        onClick={() => setSelectedImage(item.url_imagen)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        <Eye size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4" onClick={() => setSelectedImage(null)}>
          <div className="relative max-h-full max-w-full overflow-auto rounded-lg bg-white p-2">
            <img src={selectedImage} alt="Audit Proof" className="max-h-[80vh] object-contain" />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute right-4 top-4 rounded-full bg-white p-1 text-gray-900 shadow-md hover:bg-gray-100"
            >
              <ArrowLeft size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
