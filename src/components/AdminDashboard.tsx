import React, { useEffect, useState } from 'react';
import { AuditResult } from '../types';
import { Download, Eye, X, Image as ImageIcon, List } from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [history, setHistory] = useState<AuditResult[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<AuditResult | null>(null);

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setHistory(data);
        }
      })
      .catch(err => console.error('Error fetching history:', err));
  }, []);

  const handleExport = () => {
    const headers = ['ID', 'Usuario', 'Fecha', 'Cliente', 'Resultado Global', 'URL Imagen'];
    const rows = history.map(h => [
      h.id,
      h.usuario,
      h.fecha,
      h.cliente,
      h.resultado_global,
      window.location.origin + h.url_imagen // Ensure full URL if relative
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

  const parseDetails = (jsonDetails: string) => {
    try {
      return JSON.parse(jsonDetails);
    } catch (e) {
      return [];
    }
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
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                      No hay auditorías registradas aún.
                    </td>
                  </tr>
                ) : (
                  history.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
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
                          onClick={() => setSelectedAudit(item)}
                          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-900"
                        >
                          <Eye size={18} />
                          Ver Detalle
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setSelectedAudit(null)}>
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            
            <div className="flex items-center justify-between border-b p-6">
              <h2 className="text-xl font-bold text-gray-900">Detalle de Auditoría</h2>
              <button onClick={() => setSelectedAudit(null)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
              {/* Left Column: Info & Image */}
              <div className="space-y-6">
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Cliente</p>
                      <p className="font-medium text-gray-900">{selectedAudit.cliente}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Auditor</p>
                      <p className="font-medium text-gray-900">{selectedAudit.usuario}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Fecha</p>
                      <p className="font-medium text-gray-900">{new Date(selectedAudit.fecha).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Resultado</p>
                      <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        selectedAudit.resultado_global === 'OK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {selectedAudit.resultado_global}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 flex items-center gap-2 font-semibold text-gray-900">
                    <ImageIcon size={18} />
                    Evidencia Fotográfica
                  </h3>
                  <div className="overflow-hidden rounded-lg border bg-gray-100">
                    <img 
                      src={selectedAudit.url_imagen} 
                      alt="Evidencia" 
                      className="h-auto w-full object-contain"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Product List */}
              <div>
                <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-900">
                  <List size={18} />
                  Productos Evaluados
                </h3>
                <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Producto</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {parseDetails(selectedAudit.resultado_detallado).map((item: any, idx: number) => (
                        <tr key={idx} className={item.present ? 'bg-green-50/50' : item.required ? 'bg-red-50/50' : ''}>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.productName}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                              item.present 
                                ? 'bg-green-100 text-green-700' 
                                : item.required 
                                  ? 'bg-red-100 text-red-700' 
                                  : 'bg-gray-100 text-gray-600'
                            }`}>
                              {item.present ? 'Presente' : item.required ? 'Falta' : 'No Requerido'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="border-t bg-gray-50 p-4 text-right">
              <button
                onClick={() => setSelectedAudit(null)}
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 border border-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
