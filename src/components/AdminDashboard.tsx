import React, { useEffect, useState } from 'react';
import { AuditResult, AuditProcessStep } from '../types';
import { Download, Eye, X, Image as ImageIcon, List, Trash2, Upload, Activity } from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [history, setHistory] = useState<AuditResult[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<AuditResult | null>(null);
  const [showProcessLog, setShowProcessLog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [referenceList, setReferenceList] = useState<string[]>([]);
  const [selectedReferences, setSelectedReferences] = useState<string[]>([]);

  useEffect(() => {
    fetchHistory();
    fetchReferenceCount();
  }, []);

  const fetchReferenceCount = () => {
    fetch('/api/references/count')
      .then(res => res.json())
      .then(data => setReferenceCount(data.count))
      .catch(err => console.error('Error fetching reference count:', err));
  };

  const fetchReferenceList = () => {
    fetch('/api/references/list')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setReferenceList(data);
        }
      })
      .catch(err => console.error('Error fetching reference list:', err));
  };

  const handleOpenReferenceModal = () => {
    fetchReferenceList();
    setShowReferenceModal(true);
    setSelectedReferences([]);
  };

  const handleSelectReference = (filename: string) => {
    if (selectedReferences.includes(filename)) {
      setSelectedReferences(selectedReferences.filter(f => f !== filename));
    } else {
      setSelectedReferences([...selectedReferences, filename]);
    }
  };

  const handleDeleteReferences = async () => {
    if (selectedReferences.length === 0) return;
    
    if (!confirm(`¿Estás seguro de que deseas eliminar ${selectedReferences.length} referencias?`)) {
      return;
    }

    try {
      const res = await fetch('/api/references/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: selectedReferences })
      });

      if (res.ok) {
        alert('Referencias eliminadas correctamente');
        fetchReferenceList();
        fetchReferenceCount();
        setSelectedReferences([]);
      } else {
        alert('Error al eliminar referencias');
      }
    } catch (error) {
      console.error('Error deleting references:', error);
      alert('Error al eliminar referencias');
    }
  };

  const handleUploadReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/references/upload', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        alert('Referencia subida correctamente');
        fetchReferenceCount(); // Refresh count
      } else {
        alert('Error al subir referencia');
      }
    } catch (error) {
      console.error('Error uploading reference:', error);
      alert('Error al subir referencia');
    } finally {
        // Reset input
        e.target.value = '';
    }
  };

  const fetchHistory = () => {
    fetch(`/api/history?t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        console.log('History data received:', data);
        if (Array.isArray(data)) {
          setHistory(data);
        }
      })
      .catch(err => console.error('Error fetching history:', err));
  };

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

  const parseProcessLog = (jsonLog?: string): AuditProcessStep[] => {
    if (!jsonLog) return [];
    try {
      return JSON.parse(jsonLog);
    } catch (e) {
      return [];
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(history.map(h => h.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    
    if (!confirm(`¿Estás seguro de que deseas eliminar ${selectedIds.length} registros?`)) {
      return;
    }

    try {
      const res = await fetch('/api/history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      });

      if (res.ok) {
        setSelectedIds([]);
        fetchHistory();
      } else {
        alert('Error al eliminar registros');
      }
    } catch (error) {
      console.error('Error deleting records:', error);
      alert('Error al eliminar registros');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Panel de Administrador</h1>
            {referenceCount !== null && (
              <p 
                className="text-sm text-gray-500 mt-1 cursor-pointer hover:text-indigo-600 transition-colors"
                onClick={handleOpenReferenceModal}
                title="Click para gestionar referencias"
              >
                Imágenes de referencia cargadas: <span className="font-medium text-indigo-600 underline decoration-dotted">{referenceCount}</span>
              </p>
            )}
          </div>
          <div className="flex gap-4">
            {selectedIds.length > 0 && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                <Trash2 size={20} />
                Eliminar ({selectedIds.length})
              </button>
            )}
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              <Download size={20} />
              Descargar Historial
            </button>
            <label className="flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              <Upload size={20} />
              Subir Referencia
              <input 
                type="file" 
                className="hidden" 
                accept=".jpg,.jpeg,.png"
                onChange={handleUploadReference}
              />
            </label>
            <button onClick={onLogout} className="text-gray-600 hover:text-gray-900">Salir</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 md:px-6 md:py-3 text-left">
                    <input
                      type="checkbox"
                      checked={history.length > 0 && selectedIds.length === history.length}
                      onChange={handleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-2 py-2 md:px-6 md:py-3 text-left text-[10px] md:text-xs font-medium uppercase tracking-wider text-gray-500">Fecha</th>
                  <th className="px-2 py-2 md:px-6 md:py-3 text-left text-[10px] md:text-xs font-medium uppercase tracking-wider text-gray-500">Usuario</th>
                  <th className="px-2 py-2 md:px-6 md:py-3 text-left text-[10px] md:text-xs font-medium uppercase tracking-wider text-gray-500">Cliente</th>
                  <th className="px-2 py-2 md:px-6 md:py-3 text-left text-[10px] md:text-xs font-medium uppercase tracking-wider text-gray-500">Resultado</th>
                  <th className="px-2 py-2 md:px-6 md:py-3 text-left text-[10px] md:text-xs font-medium uppercase tracking-wider text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                      No hay auditorías registradas aún.
                    </td>
                  </tr>
                ) : (
                  history.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-2 py-2 md:px-6 md:py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => handleSelectOne(item.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm text-gray-900">
                        {new Date(item.fecha).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm text-gray-900">
                        Auditor {item.usuario}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm text-gray-900">
                        {item.cliente}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4">
                        {(() => {
                          const details = parseDetails(item.resultado_detallado);
                          const required = details.filter((d: any) => d.required);
                          const missingCount = required.filter((d: any) => !d.present).length;
                          
                          if (missingCount === 0) {
                            return (
                              <span className="inline-flex rounded-full bg-green-100 px-2 text-[10px] font-semibold leading-5 text-green-800 md:text-xs">
                                OK
                              </span>
                            );
                          } else {
                            return (
                              <span className="inline-flex rounded-full bg-red-100 px-2 text-[10px] font-semibold leading-5 text-red-800 md:text-xs">
                                Faltan: {missingCount}
                              </span>
                            );
                          }
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm font-medium">
                        <div className="flex gap-3">
                          <button
                            onClick={() => { setSelectedAudit(item); setShowProcessLog(false); }}
                            className="flex items-center justify-center rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-900"
                            title="Ver Detalle"
                          >
                            <Eye size={20} />
                          </button>
                          <button
                            onClick={() => { setSelectedAudit(item); setShowProcessLog(true); }}
                            className="flex items-center justify-center rounded-md p-1.5 text-teal-600 hover:bg-teal-50 hover:text-teal-900"
                            title="Ver Proceso"
                          >
                            <Activity size={20} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Reference Management Modal */}
      {showReferenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setShowReferenceModal(false)}>
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b p-6">
              <h2 className="text-xl font-bold text-gray-900">Gestión de Referencias</h2>
              <button onClick={() => setShowReferenceModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-4 flex justify-between items-center">
                <p className="text-sm text-gray-500">Selecciona las imágenes que deseas eliminar.</p>
                {selectedReferences.length > 0 && (
                  <button
                    onClick={handleDeleteReferences}
                    className="flex items-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
                  >
                    <Trash2 size={16} />
                    Eliminar ({selectedReferences.length})
                  </button>
                )}
              </div>

              <div className="max-h-[60vh] overflow-y-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 w-10">
                        <input
                          type="checkbox"
                          checked={referenceList.length > 0 && selectedReferences.length === referenceList.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedReferences([...referenceList]);
                            else setSelectedReferences([]);
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Nombre de Archivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {referenceList.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-6 py-4 text-center text-sm text-gray-500">
                          No hay referencias cargadas.
                        </td>
                      </tr>
                    ) : (
                      referenceList.map((filename, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={selectedReferences.includes(filename)}
                              onChange={() => handleSelectReference(filename)}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">{filename}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t bg-gray-50 p-4 text-right">
              <button
                onClick={() => setShowReferenceModal(false)}
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 border border-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setSelectedAudit(null)}>
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            
            <div className="flex items-center justify-between border-b p-6">
              <h2 className="text-xl font-bold text-gray-900">
                {showProcessLog ? 'Registro del Proceso de Auditoría' : 'Detalle de Auditoría'}
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowProcessLog(!showProcessLog)}
                  className="rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  {showProcessLog ? 'Ver Resultados' : 'Ver Proceso'}
                </button>
                <button onClick={() => setSelectedAudit(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>
            </div>

            {showProcessLog ? (
              <div className="p-6">
                <div className="space-y-4">
                  {parseProcessLog(selectedAudit.proceso_auditoria).length === 0 ? (
                    <div className="text-gray-500 italic">
                      <p>No hay registro de proceso disponible para esta auditoría.</p>
                      <div className="mt-2 text-xs bg-gray-100 p-2 rounded border">
                        <strong>Debug Info:</strong>
                        <pre>{JSON.stringify({
                          hasField: 'proceso_auditoria' in selectedAudit,
                          rawValue: selectedAudit.proceso_auditoria,
                          parsedLength: parseProcessLog(selectedAudit.proceso_auditoria).length
                        }, null, 2)}</pre>
                      </div>
                    </div>
                  ) : (
                    parseProcessLog(selectedAudit.proceso_auditoria).map((step, idx) => (
                      <div key={idx} className="flex items-start gap-4 rounded-lg border p-4 shadow-sm">
                        <div className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                          step.status === 'OK' ? 'bg-green-100 text-green-600' : 
                          step.status === 'Warning' ? 'bg-yellow-100 text-yellow-600' : 
                          'bg-red-100 text-red-600'
                        }`}>
                          {step.status === 'OK' ? '✓' : step.status === 'Warning' ? '!' : 'X'}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{step.step}</h4>
                          <p className={`text-sm font-medium ${
                            step.status === 'OK' ? 'text-green-700' : 
                            step.status === 'Warning' ? 'text-yellow-700' : 
                            'text-red-700'
                          }`}>
                            Estado: {step.status}
                          </p>
                          {step.details && (
                            <p className="mt-1 text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                              {step.details}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
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
                        {parseDetails(selectedAudit.resultado_detallado)
                          .sort((a: any, b: any) => {
                            // Priority: 0 = Falta (Required & !Present), 1 = Presente, 2 = Others
                            const pA = (a.required && !a.present) ? 0 : (a.present ? 1 : 2);
                            const pB = (b.required && !b.present) ? 0 : (b.present ? 1 : 2);
                            return pA - pB;
                          })
                          .map((item: any, idx: number) => (
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
            )}

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
