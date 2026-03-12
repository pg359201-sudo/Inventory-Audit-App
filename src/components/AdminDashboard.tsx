import React, { useEffect, useState } from 'react';
import { AuditResult, AuditProcessStep } from '../types';
import { Download, Eye, X, Image as ImageIcon, List, Trash2, Upload, Activity, CircleDot, Circle, FileEdit, Wrench } from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [history, setHistory] = useState<AuditResult[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<AuditResult | null>(null);
  const [showProcessLog, setShowProcessLog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [referenceCount, setReferenceCount] = useState<number | null>(null);
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [referenceList, setReferenceList] = useState<string[]>([]);
  const [selectedReferences, setSelectedReferences] = useState<string[]>([]);

  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    fetchHistory();
    fetchReferenceCount();
  }, []);

  const fetchReferenceCount = () => {
    fetch('/api/references/count')
      .then(res => res.json())
      .then(data => {
          setReferenceCount(data.count);
          setDebugInfo(prev => ({ ...prev, countSource: data.source }));
      })
      .catch(err => console.error('Error fetching reference count:', err));
  };

  const fetchReferenceList = () => {
    setDebugInfo(prev => ({ ...prev, loading: true, listStatus: 'fetching' }));
    fetch(`/api/references/count?t=${Date.now()}`)
      .then(async res => {
        const text = await res.text();
        setDebugInfo(prev => ({ ...prev, rawResponse: text.substring(0, 500), status: res.status }));
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error('Invalid JSON');
        }
      })
      .then(data => {
        if (data.files && Array.isArray(data.files)) {
          setReferenceList(data.files);
          setDebugInfo(prev => ({ ...prev, listSuccess: true, listLength: data.files.length }));
        } else {
            setDebugInfo(prev => ({ ...prev, listError: 'No files array in response', dataType: typeof data }));
        }
      })
      .catch(err => setDebugInfo(prev => ({ ...prev, listError: err.message })))
      .finally(() => setDebugInfo(prev => ({ ...prev, loading: false })));
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

  const handleAdjust = async (auditId: number, productName: string) => {
    // Optimistic UI update
    setHistory(prev => prev.map(a => {
      if (a.id === auditId) {
        const manual_adjustments = a.manual_adjustments ? [...a.manual_adjustments] : [];
        const index = manual_adjustments.indexOf(productName);
        if (index > -1) {
          manual_adjustments.splice(index, 1);
        } else {
          manual_adjustments.push(productName);
        }
        const updatedAudit = { ...a, manual_adjustments };
        
        // Update selectedAudit if it's the one currently open
        if (selectedAudit && selectedAudit.id === auditId) {
          setSelectedAudit(updatedAudit);
        }
        
        return updatedAudit;
      }
      return a;
    }));

    // Save to backend
    try {
      const res = await fetch(`/api/audit/${auditId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName })
      });
      
      if (!res.ok) {
        console.error('Failed to save adjustment to backend');
        // Optionally revert state here if needed, but for now we just log
      }
    } catch (error) {
      console.error('Error saving adjustment:', error);
    }
  };

  const handleExport = () => {
    const headers = ['ID', 'Usuario', 'Fecha', 'Cliente', 'Resultado Global', 'URL Imagen', 'Ajustes Manuales'];
    const rows = history.map(h => {
      const details = parseDetails(h.resultado_detallado);
      const required = details.filter((d: any) => d.required);
      let missingCount = required.filter((d: any) => !d.present).length;
      
      if (h.manual_adjustments && h.manual_adjustments.length > 0) {
        missingCount = Math.max(0, missingCount - h.manual_adjustments.length);
      }
      
      const isOk = missingCount === 0;
      const finalResult = isOk ? 'OK' : `Faltan: ${missingCount}`;
      const adjustments = h.manual_adjustments ? h.manual_adjustments.join(' | ') : '';

      return [
        h.id,
        h.usuario,
        h.fecha,
        `"${h.cliente}"`,
        `"${finalResult}"`,
        window.location.origin + h.url_imagen,
        `"${adjustments}"`
      ];
    });

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
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Panel Administrador</h1>
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
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-3 md:gap-4">
              <button
                onClick={handleExport}
                className="flex items-center gap-1 md:gap-2 rounded-md bg-green-600 px-2.5 py-1.5 md:px-4 md:py-2 text-xs md:text-sm text-white hover:bg-green-700"
                title="Descargar Historial"
              >
                <Download size={16} className="md:w-5 md:h-5" />
                <span className="hidden md:inline">Descargar Historial</span>
              </button>
              <button onClick={onLogout} className="text-sm font-medium text-gray-600 hover:text-gray-900">Salir</button>
            </div>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 md:gap-4">
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1 md:gap-2 rounded-md bg-red-600 px-2.5 py-1.5 md:px-4 md:py-2 text-xs md:text-sm text-white hover:bg-red-700"
                  title="Eliminar seleccionados"
                >
                  <Trash2 size={16} className="md:w-5 md:h-5" />
                  <span className="hidden md:inline">Eliminar ({selectedIds.length})</span>
                </button>
              </div>
            )}
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
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4 text-[10px] md:text-sm text-gray-900">
                        {(() => {
                          const d = new Date(item.fecha);
                          const day = d.getDate().toString().padStart(2, '0');
                          const month = (d.getMonth() + 1).toString().padStart(2, '0');
                          const year = d.getFullYear().toString().slice(-2);
                          const hours = d.getHours().toString().padStart(2, '0');
                          const minutes = d.getMinutes().toString().padStart(2, '0');
                          return `${day}/${month}/${year} ${hours}:${minutes}hs`;
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm text-gray-900">
                        A{item.usuario}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm text-gray-900">
                        {item.cliente}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4">
                        {(() => {
                          const details = parseDetails(item.resultado_detallado);
                          const required = details.filter((d: any) => d.required);
                          let missingCount = required.filter((d: any) => !d.present).length;
                          
                          // Subtract manually adjusted items from missing count
                          if (item.manual_adjustments && item.manual_adjustments.length > 0) {
                            missingCount = Math.max(0, missingCount - item.manual_adjustments.length);
                          }
                          
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
                        <div className="flex gap-3 items-center">
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
                          {item.manual_adjustments && item.manual_adjustments.length > 0 && (
                            <span title="Modificado manualmente" className="text-amber-500">
                              <Wrench size={18} />
                            </span>
                          )}
                          {(() => {
                            const details = parseDetails(item.resultado_detallado);
                            const hasAdjustments = details.some((d: any) => d.manuallyAdjusted);
                            if (hasAdjustments) {
                              return (
                                <div className="flex items-center justify-center rounded-md p-1.5 text-amber-600" title="Auditoría ajustada manualmente">
                                  <FileEdit size={20} />
                                </div>
                              );
                            }
                            return null;
                          })()}
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
              <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-500">Gestiona las imágenes de referencia.</p>
                <div className="flex gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
                    <Upload size={16} />
                    Subir Referencia
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".jpg,.jpeg,.png"
                      onChange={handleUploadReference}
                    />
                  </label>
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
            
            <div className="flex items-center justify-between border-b p-4 md:p-6">
              <h2 className="text-base md:text-xl font-bold text-gray-900">
                {showProcessLog ? 'Registro del Proceso de Auditoría' : 'Detalle de Auditoría'}
              </h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowProcessLog(!showProcessLog)}
                  className="flex h-7 md:h-9 items-center justify-center rounded-md bg-gray-100 px-2 md:px-3 text-[10px] md:text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  {showProcessLog ? 'Ver Resultados' : 'Ver Proceso'}
                </button>
                <button 
                  onClick={() => setSelectedAudit(null)} 
                  className="flex h-7 w-7 md:h-9 md:w-9 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X size={16} className="md:w-6 md:h-6" />
                </button>
              </div>
            </div>

            {showProcessLog ? (
              <div className="p-4 md:p-6">
                <div className="space-y-4">
                  {parseProcessLog(selectedAudit.proceso_auditoria).length === 0 ? (
                    <div className="text-gray-500 italic">
                      <p>No hay registro de proceso disponible para esta auditoría.</p>
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
                            <div className="mt-1 text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                              {(() => {
                                if (step.details.includes('Reglas (JSON):') || step.details.includes('Guía Maestra:') || step.details.includes('Refs Individuales:') || step.step === 'Análisis de referencias faltantes') {
                                  const parts = step.details.split(' | ');
                                  return (
                                    <div className="space-y-1">
                                      {parts.map((part, i) => {
                                        const colonIndex = part.indexOf(':');
                                        if (colonIndex !== -1) {
                                          const title = part.substring(0, colonIndex + 1);
                                          const rest = part.substring(colonIndex + 1);
                                          return (
                                            <div key={i}>
                                              <span className="font-bold text-gray-800">{title}</span>{rest}
                                            </div>
                                          );
                                        }
                                        return <div key={i}>{part}</div>;
                                      })}
                                    </div>
                                  );
                                }
                                return <>{step.details}</>;
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 md:gap-6 md:p-6">
                {/* Left Column: Info & Image */}
                <div className="space-y-6">
                  <div className="rounded-lg bg-gray-50 p-2 md:p-4">
                    <div className="grid grid-cols-2 gap-2 md:gap-4 text-xs md:text-sm">
                      <div>
                        <p className="text-gray-500 text-[10px] md:text-sm">Cliente</p>
                        <p className="font-medium text-gray-900 text-[11px] md:text-sm leading-tight">{selectedAudit.cliente}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[10px] md:text-sm">Auditor</p>
                        <p className="font-medium text-gray-900 text-[11px] md:text-sm leading-tight">{selectedAudit.usuario}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[10px] md:text-sm">Fecha</p>
                        <p className="font-medium text-gray-900 text-[11px] md:text-sm leading-tight">{new Date(selectedAudit.fecha).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[10px] md:text-sm mb-0.5 md:mb-0">Resultado</p>
                        {(() => {
                          const details = parseDetails(selectedAudit.resultado_detallado);
                          const required = details.filter((d: any) => d.required);
                          let missingCount = required.filter((d: any) => !d.present).length;
                          
                          if (selectedAudit.manual_adjustments && selectedAudit.manual_adjustments.length > 0) {
                            missingCount = Math.max(0, missingCount - selectedAudit.manual_adjustments.length);
                          }
                          
                          const isOk = missingCount === 0;
                          
                          return (
                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              isOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {isOk ? 'OK' : `Faltan: ${missingCount}`}
                            </span>
                          );
                        })()}
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
                          <th className="px-2 md:px-4 py-2 text-left text-[10px] md:text-xs font-medium uppercase text-gray-500">Producto</th>
                          <th className="px-1 md:px-4 py-2 text-left text-[10px] md:text-xs font-medium uppercase text-gray-500 w-16 md:w-auto">Estado</th>
                          <th className="px-1 md:px-4 py-2 text-center text-[10px] md:text-xs font-medium uppercase text-gray-500 w-12 md:w-auto">Ajuste</th>
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
                          .map((item: any, idx: number) => {
                            const isAdjusted = selectedAudit.manual_adjustments?.includes(item.productName);
                            const isEffectivelyPresent = item.present || isAdjusted;
                            
                            return (
                              <tr key={idx} className={isEffectivelyPresent ? 'bg-green-50/50' : item.required ? 'bg-red-50/50' : ''}>
                                <td className="px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm text-gray-900">
                                  {item.productName}
                                  {isAdjusted && <span className="ml-1 text-[10px] md:text-xs text-amber-600 font-medium">(Ajust.)</span>}
                                </td>
                                <td className="px-1 md:px-4 py-1.5 md:py-2 text-xs md:text-sm">
                                  <span className={`inline-flex items-center rounded-md px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs font-medium ${
                                    isEffectivelyPresent 
                                      ? 'bg-green-100 text-green-700' 
                                      : item.required 
                                        ? 'bg-red-100 text-red-700' 
                                        : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {isEffectivelyPresent ? 'Presente' : item.required ? 'Falta' : 'No Requerido'}
                                  </span>
                                </td>
                                <td className="px-1 md:px-4 py-1.5 md:py-2 text-xs md:text-sm text-center">
                                  {item.required && !item.present && (
                                    <button
                                      onClick={() => handleAdjust(selectedAudit.id, item.productName)}
                                      className={`inline-flex items-center justify-center p-0.5 md:p-1 rounded-full transition-colors ${
                                        isAdjusted 
                                          ? 'text-amber-600 hover:bg-amber-100' 
                                          : 'text-gray-400 hover:bg-gray-200'
                                      }`}
                                      title={isAdjusted ? "Revertir ajuste" : "Ajustar manualmente"}
                                    >
                                      {isAdjusted ? <CircleDot size={16} /> : <Circle size={16} />}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t bg-gray-50 p-3 md:p-4 text-right">
              <button
                onClick={() => setSelectedAudit(null)}
                className="rounded-md bg-white px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 border border-gray-300"
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
