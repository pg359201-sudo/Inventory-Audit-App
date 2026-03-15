import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Camera, Upload, CheckCircle, XCircle, Loader2, RefreshCw, List } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { ClientRule, AuditResult, ProductStatus } from '../types';

interface AuditorDashboardProps {
  onLogout: () => void;
}

export default function AuditorDashboard({ onLogout }: AuditorDashboardProps) {
  const [auditorId, setAuditorId] = useState('V');
  const [clients, setClients] = useState<ClientRule[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    globalResult: string;
    detailedResult: ProductStatus[];
    fileUrl: string;
    processLog?: any;
  } | null>(null);
  const [manualAdjustments, setManualAdjustments] = useState<Record<string, boolean>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isReferenceModalOpen, setIsReferenceModalOpen] = useState(false);

  useEffect(() => {
    fetch('/api/clients')
      .then(async res => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Server error: ${res.status} ${text}`);
        }
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setClients(data);
          setErrorMsg(null);
        } else {
          console.error('Data is not an array:', data);
          setClients([]);
          setErrorMsg('Received invalid data format from server');
        }
      })
      .catch(err => {
        console.error('Error fetching clients:', err);
        setClients([]);
        setErrorMsg(`Error loading clients: ${err.message}`);
      });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = async (originalFile: File) => {
    // Compress image
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1920,
      useWebWorker: true
    };

    try {
      const compressedFile = await imageCompression(originalFile, options);
      setFile(compressedFile);
      setPreviewUrl(URL.createObjectURL(compressedFile));
    } catch (error) {
      console.error('Compression error:', error);
      alert('Error al procesar la imagen');
    }
  };

  const handleSubmit = async () => {
    if (!file || !selectedClient) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('usuario', auditorId);
    formData.append('clienteId', selectedClient);
    
    const client = clients.find(c => c['Codigo FEMSA'] === selectedClient);
    formData.append('clienteNombre', client ? client['Nombre Store'] : '');

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.details || 'Error en la auditoría');
      }
      
      const data = await res.json();
      setResult(data);
    } catch (error: any) {
      console.error(error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setSelectedClient('');
    setManualAdjustments({});
  };

  const handleSaveAndExit = async () => {
    if (!result || !selectedClient) return;
    
    setLoading(true);
    try {
      const client = clients.find(c => c['Codigo FEMSA'] === selectedClient);
      
      // Recalculate global result based on manual adjustments
      const hasMissing = result.detailedResult.some(p => p.required && !p.present && !manualAdjustments[p.productName]);
      const finalGlobalResult = hasMissing ? 'Falta Referencia' : 'OK';

      const payload = {
        usuario: auditorId,
        cliente: client ? client['Nombre Store'] : '',
        fecha: new Date().toISOString(),
        resultado_detallado: result.detailedResult,
        resultado_global: finalGlobalResult,
        url_imagen: result.fileUrl,
        proceso_auditoria: result.processLog || [],
        manual_adjustments: Object.keys(manualAdjustments).filter(k => manualAdjustments[k])
      };

      const res = await fetch('/api/save-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Error al guardar la auditoría');
      
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        resetForm();
      }, 2000);
    } catch (error: any) {
      console.error(error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRescan = async () => {
    if (!file || !selectedClient || !result) return;

    // Filter out products that are manually adjusted
    const missingProducts = result.detailedResult
      .filter(p => p.required && !p.present && !manualAdjustments[p.productName])
      .map(p => p.productName);

    if (missingProducts.length === 0) {
      alert("No hay productos faltantes para re-escanear.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('usuario', auditorId);
    formData.append('clienteId', selectedClient);
    formData.append('isRescan', 'true');
    formData.append('missingProducts', missingProducts.join(','));
    formData.append('previousDetailedResult', JSON.stringify(result.detailedResult));
    
    const client = clients.find(c => c['Codigo FEMSA'] === selectedClient);
    formData.append('clienteNombre', client ? client['Nombre Store'] : '');

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || errorData.details || 'Error en la auditoría');
      }
      
      const data = await res.json();
      
      if (result.processLog && data.processLog) {
        let previousLogs = [...result.processLog];
        if (!previousLogs.some((log: any) => log.step && log.step.includes('INTENTO 1'))) {
          previousLogs.unshift({ step: '--- INTENTO 1 (AUDITORÍA INICIAL) ---', status: 'OK' });
        }
        const attemptNumber = previousLogs.filter((log: any) => log.step && log.step.includes('INTENTO')).length + 1;
        data.processLog = [
          ...previousLogs,
          { step: `--- INTENTO ${attemptNumber} (RE-AUDITORÍA DE FALTANTES) ---`, status: 'OK' },
          ...data.processLog
        ];
      }
      
      setResult(data);
    } catch (error: any) {
      console.error(error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const hasMissing = result.detailedResult.some(p => p.required && !p.present && !manualAdjustments[p.productName]);
    const currentGlobalResult = hasMissing ? 'Falta Referencia' : 'OK';

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md space-y-6">
          <div className="flex items-center justify-end">
            <button onClick={onLogout} className="text-base font-medium text-gray-500 hover:text-gray-800 transition-colors">Salir</button>
          </div>

          <div className="w-full rounded-xl bg-white p-4 shadow-sm flex flex-col relative">
            {hasMissing && (
              <button
                onClick={handleRescan}
                disabled={loading}
                title="Re-Auditar Faltantes"
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#D4AF37] bg-white text-[#B5952F] hover:bg-[#fdf8e7] transition-colors shadow-sm disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
              </button>
            )}
            <div className="mb-3 text-center shrink-0">
              {currentGlobalResult === 'OK' ? (
                <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
              ) : (
                <XCircle className="mx-auto h-8 w-8 text-red-500" />
              )}
              <h2 className="mt-1 text-base font-bold">
                Resultado: {currentGlobalResult}
              </h2>
            </div>

            <div className="mb-3">
              <div className="grid grid-cols-2 gap-1.5">
                {[...result.detailedResult].sort((a, b) => {
                  // Priority: 0 = Falta (Required & !Present), 1 = Presente (Required), 2 = Others (Not Required)
                  const pA = (a.required && !a.present) ? 0 : (a.required && a.present ? 1 : 2);
                  const pB = (b.required && !b.present) ? 0 : (b.required && b.present ? 1 : 2);
                  return pA - pB;
                }).map((item, idx) => {
                  const isRequired = item.required;
                  const isActuallyPresent = item.present;
                  const isManuallyPresent = manualAdjustments[item.productName];
                  const isPresent = isActuallyPresent || isManuallyPresent;
                  
                  let bgClass = 'bg-gray-50 border-gray-100';
                  if (isRequired) {
                    bgClass = isPresent ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100';
                  }

                  let badgeClass = 'text-gray-400';
                  let badgeText = '-';
                  if (isRequired) {
                    badgeClass = isPresent ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800';
                    badgeText = isActuallyPresent ? 'Presente' : (isManuallyPresent ? 'Presente (Manual)' : 'Falta');
                  }

                  return (
                    <div key={idx} className={`flex flex-col rounded p-2 text-xs border ${bgClass}`}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className={`font-semibold truncate text-xs leading-tight ${isRequired ? 'text-gray-800' : 'text-gray-400'}`} title={item.productName}>
                            {item.productName}
                          </span>
                          {!isRequired && isPresent && (
                            <CheckCircle className="w-3 h-3 text-gray-400 shrink-0" />
                          )}
                        </div>
                        <span className={`self-start font-bold px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${badgeClass}`}>
                          {badgeText}
                        </span>
                        {isRequired && !isActuallyPresent && (
                          <label className="mt-1 flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3 w-3"
                              checked={isManuallyPresent || false}
                              onChange={(e) => {
                                setManualAdjustments(prev => ({
                                  ...prev,
                                  [item.productName]: e.target.checked
                                }));
                              }}
                            />
                            <span>{['Vat 69 200 ml', 'Smirnoff Ice'].includes(item.productName) ? '¿Está/otra sección?' : '¿Está?'}</span>
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-row gap-3 shrink-0 justify-center mt-2">
              <button
                onClick={handleSaveAndExit}
                disabled={loading}
                className="rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Guardando...' : 'Guardar y Salir'}
              </button>
            </div>
          </div>
        </div>
        
        {showSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl p-6 shadow-xl flex flex-col items-center max-w-xs w-full"
            >
              <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
              <h3 className="text-lg font-bold text-gray-900 text-center">Gracias Crack!</h3>
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Sesión {auditorId}</h1>
          <button onClick={onLogout} className="text-base font-medium text-gray-500 hover:text-gray-800 transition-colors">Salir</button>
        </div>

        {errorMsg && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <XCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{errorMsg}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Auditor</label>
              <select
                value={auditorId}
                onChange={(e) => setAuditorId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                {['V', 'D', 'M', 'P'].map(id => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Cliente</label>
                {selectedClient && (
                  <button
                    onClick={() => setIsReferenceModalOpen(true)}
                    className="text-xs flex items-center gap-1 text-green-600 hover:text-green-800 font-medium"
                  >
                    <List className="h-3.5 w-3.5" />
                    Ver Requeridos
                  </button>
                )}
              </div>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="">Seleccione un cliente</option>
                {clients.map(client => (
                  <option key={client['Codigo FEMSA']} value={client['Codigo FEMSA']}>
                    {client['Nombre Store']}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Captura de Foto</label>
              <div 
                className="flex justify-center rounded-lg border-2 border-dashed border-gray-300 px-4 py-6 sm:px-6 sm:py-10"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <div className="text-center">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="mx-auto max-h-48 sm:max-h-64 rounded-lg object-contain" />
                  ) : (
                    <Camera className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
                  )}
                  <div className="mt-2 sm:mt-4 flex flex-col sm:flex-row justify-center text-sm leading-6 text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500"
                    >
                      <span>Subir un archivo</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="sr-only"
                        accept="image/*"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1 hidden sm:block">o arrastrar y soltar</p>
                  </div>
                  <p className="text-xs leading-5 text-gray-600 mt-1 sm:mt-0">PNG, JPG hasta 10MB</p>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleSubmit}
                disabled={!file || !selectedClient || loading}
                className="flex items-center justify-center rounded-md bg-indigo-600 px-6 py-2 text-white hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  'Auditar'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Requeridos */}
      {isReferenceModalOpen && (() => {
        const requiredProducts = selectedClient 
          ? Object.entries(clients.find(c => c['Codigo FEMSA'] === selectedClient) || {})
              .filter(([key, value]) => key !== 'Codigo FEMSA' && key !== 'Nombre Store' && value === 'Si')
              .map(([key]) => key)
          : [];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  Productos Requeridos
                  <span className="bg-green-100 text-green-800 text-sm font-semibold px-2 py-0.5 rounded-full">
                    {requiredProducts.length}
                  </span>
                </h3>
                <button onClick={() => setIsReferenceModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto mb-4 border rounded-md p-2 bg-gray-50">
                {requiredProducts.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No hay productos requeridos.</p>
                ) : (
                  <ul className="space-y-2">
                    {requiredProducts.map((prod, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <span className="leading-tight">{prod}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
