import React, { useEffect, useState, useRef } from 'react';
import { AuditResult, AuditProcessStep } from '../types';
import { Download, Eye, X, Image as ImageIcon, List, Trash2, Upload, Activity, CircleDot, Circle, FileEdit, Wrench, BookOpen, Search } from 'lucide-react';
import * as htmlToImage from 'html-to-image';

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
  const [showEffectivenessModal, setShowEffectivenessModal] = useState(false);
  const [showRulesInfoModal, setShowRulesInfoModal] = useState(false);
  const [referenceList, setReferenceList] = useState<string[]>([]);
  const [selectedReferences, setSelectedReferences] = useState<string[]>([]);
  const modalContentRef = useRef<HTMLDivElement>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');

  const filteredHistory = history.filter(item => {
    if (clientSearch === '') return true;
    const d = new Date(item.fecha);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear().toString().slice(-2);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}hs`;
    
    return item.cliente.toLowerCase().includes(clientSearch.toLowerCase()) || formattedDate.includes(clientSearch);
  });

  const calculateMissingCount = (details: any[], manual_adjustments: string[] | undefined) => {
    const required = details.filter((d: any) => d.required);
    let missingCount = 0;
    required.forEach((d: any) => {
      const isAdjusted = manual_adjustments?.includes(d.productName);
      const originalPresent = d.manuallyAdjusted ? false : d.present;
      const isEffectivelyPresent = originalPresent ? !isAdjusted : isAdjusted;
      if (!isEffectivelyPresent) {
        missingCount++;
      }
    });
    return missingCount;
  };

  const handleDownloadJPG = async () => {
    if (!modalContentRef.current || !selectedAudit) return;
    
    try {
      setIsDownloading(true);
      
      // Convertir la imagen a base64 solo cuando el usuario hace clic en descargar
      let base64 = selectedAudit.url_imagen;
      try {
        const url = selectedAudit.url_imagen;
        if (url.startsWith('http')) {
          try {
            // Intento 1: allorigins
            const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
            if (!response.ok) throw new Error('Proxy 1 failed');
            const blob = await response.blob();
            base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (e1) {
            console.warn('Proxy 1 failed, trying Proxy 2...', e1);
            // Intento 2: corsproxy.io (útil si Safari bloquea el primero por anti-tracking)
            const response2 = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
            if (!response2.ok) throw new Error('Proxy 2 failed');
            const blob2 = await response2.blob();
            base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob2);
            });
          }
        }
      } catch (proxyError) {
        console.warn('All proxies failed, using original URL', proxyError);
        // Fallback a la URL original si los proxies fallan
      }
      
      setBase64Image(base64);
      
      // Asegurar que la imagen base64 esté completamente decodificada por el navegador antes de capturar
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve; // Continuar incluso si falla
        img.src = base64;
      });
      
      // Pausa adicional pequeña para que React actualice el DOM
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Detectar si es móvil para ajustar la calidad y evitar problemas de memoria (común en iOS/Safari)
      const isMobile = window.innerWidth < 768;
      
      const options = {
        quality: isMobile ? 0.92 : 0.95,
        backgroundColor: '#ffffff',
        pixelRatio: isMobile ? 1.5 : 2, // Resolución mejorada en móviles (1.5x) para mayor nitidez sin saturar memoria
        cacheBust: true, // Ayuda a Safari a no usar versiones cacheadas corruptas
        width: modalContentRef.current.scrollWidth,
        height: modalContentRef.current.scrollHeight,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      };
      
      // TRUCO PARA EVITAR CORTE POR SCROLL: Quitar restricciones de altura del contenedor padre temporalmente
      const parentElement = modalContentRef.current.parentElement;
      const originalMaxHeight = parentElement?.style.maxHeight || '';
      const originalOverflow = parentElement?.style.overflow || '';
      
      if (parentElement) {
        parentElement.style.maxHeight = 'none';
        parentElement.style.overflow = 'visible';
      }

      // TRUCO PARA IOS/SAFARI: Hacer un render "falso" primero para forzar la carga de la imagen en el canvas
      try {
        await htmlToImage.toPng(modalContentRef.current, options);
      } catch (e) {
        // Ignorar errores del primer render
      }
      
      const dataUrl = await htmlToImage.toJpeg(modalContentRef.current, options);
      
      // Restaurar restricciones de scroll
      if (parentElement) {
        parentElement.style.maxHeight = originalMaxHeight;
        parentElement.style.overflow = originalOverflow;
      }
      
      // En móviles, los dataUrl muy largos pueden fallar al descargar directamente en el href. 
      // Es mucho más seguro convertirlo a un Blob y usar URL.createObjectURL
      const res = await fetch(dataUrl);
      const blobData = await res.blob();
      const blobUrl = window.URL.createObjectURL(blobData);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `auditoria_${selectedAudit.cliente.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().getTime()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Limpiar memoria del navegador
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
      
    } catch (error: any) {
      console.error('Error generating JPG:', error);
      alert(`Hubo un error al generar la imagen (${error.message || 'Desconocido'}). Por favor, intenta de nuevo.`);
    } finally {
      setIsDownloading(false);
      setBase64Image(null); // Limpiar para que la próxima vez cargue rápido
    }
  };

  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    fetchHistory();
    fetchReferenceCount();

    // Auto-refresh every 5 seconds for real-time synchronization
    const interval = setInterval(() => {
      fetchHistory();
    }, 5000);

    return () => clearInterval(interval);
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

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchHistory = () => {
    fetch(`/api/history?t=${Date.now()}`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP Error: ${res.status} ${await res.text()}`);
        return res.json();
      })
      .then(data => {
        console.log('History data received:', data);
        if (Array.isArray(data)) {
          setHistory(data);
          setErrorMsg(null);
        } else {
          setErrorMsg('Data is not an array: ' + typeof data);
        }
      })
      .catch(err => {
        console.error('Error fetching history:', err);
        setErrorMsg(err.message);
      });
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
      const missingCount = calculateMissingCount(details, h.manual_adjustments);
      
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

  const parseDetails = (jsonDetails: string | null) => {
    if (!jsonDetails) return [];
    try {
      const parsed = JSON.parse(jsonDetails);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  const computeEffectiveness = () => {
    const productStats: Record<string, { total: number, failures: number, falsePositives: number, falseNegatives: number }> = {};
    const errorLogs: { date: string; auditId: number; productName: string; type: 'Falso Positivo' | 'Falso Negativo'; client: string; iaState: string; auditorState: string }[] = [];

    history.forEach(audit => {
      // Solo contabilizar desde el mes de mayo de 2026 en adelante
      if (new Date(audit.fecha).getTime() < new Date('2026-05-01T00:00:00Z').getTime()) {
        return;
      }

      const details = parseDetails(audit.resultado_detallado);
      const manualAdjs = audit.manual_adjustments || [];

      details.forEach((item: any) => {
        if (item.reason && (item.reason.includes('No requerido') || item.reason === 'AI did not return data for this product')) {
            return;
        }

        const pName = item.productName;
        if (!productStats[pName]) {
            productStats[pName] = { total: 0, failures: 0, falsePositives: 0, falseNegatives: 0 };
        }
        productStats[pName].total++;

        let iaPresent = item.present;
        let auditorPresent = item.present;
        let isAdjusted = false;

        if (item.manuallyRejected) {
            iaPresent = true;
            auditorPresent = false;
            isAdjusted = true;
        } else if (manualAdjs.includes(pName)) {
            iaPresent = item.present;
            auditorPresent = !item.present;
            isAdjusted = true;
        }

        if (isAdjusted) {
            productStats[pName].failures++;
            const type = (iaPresent === true && auditorPresent === false) ? 'Falso Positivo' : 'Falso Negativo';
            const iaStateStr = iaPresent ? 'Sí está' : 'No está';
            const auditorStateStr = auditorPresent ? 'Sí está' : 'No está';
            
            if (type === 'Falso Positivo') {
                productStats[pName].falsePositives++;
            } else {
                productStats[pName].falseNegatives++;
            }
            
            errorLogs.push({ 
                date: audit.fecha, 
                auditId: audit.id, 
                productName: pName, 
                type,
                client: audit.cliente,
                iaState: iaStateStr,
                auditorState: auditorStateStr
            });
        }
      });
    });

    // Sort logs by date descending
    errorLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Compute top failures
    const topProducts = Object.keys(productStats)
        .map(k => ({
            name: k,
            total: productStats[k].total,
            failures: productStats[k].failures,
            fp: productStats[k].falsePositives,
            fn: productStats[k].falseNegatives,
            effectiveness: productStats[k].total > 0 ? ((productStats[k].total - productStats[k].failures) / productStats[k].total * 100).toFixed(1) : '100.0'
        }))
        .filter(p => p.failures > 0)
        .sort((a, b) => b.failures - a.failures);

    return { productStats, errorLogs, topProducts };
  };

  const effectivenessData = showEffectivenessModal ? computeEffectiveness() : null;

  const parseProcessLog = (jsonLog?: string | any[]): AuditProcessStep[] => {
    if (!jsonLog) return [];
    let log: AuditProcessStep[] = [];
    if (Array.isArray(jsonLog)) log = jsonLog;
    else {
      try { log = JSON.parse(jsonLog as string); } catch (e) { return []; }
    }

    const hasOldImageStep = log.find(s => s.step === 'Carga de Imágenes de Referencia');
    const hasOldDescStep = log.find(s => s.step === 'Inyección de Descripciones Visuales (Texto)');
    const hasMyNewImageStep = log.find(s => s.step === 'Referencias visuales individuales');

    if (hasOldImageStep || hasOldDescStep || hasMyNewImageStep) {
      const newLog: AuditProcessStep[] = [];
      let missingRefStep = null;
      let validationStep = null;
      let analysisStep = null;
      let reviewSteps: AuditProcessStep[] = [];
      
      let loadedRefs = 0;
      let masterPhotos = 1; // default assumption for old
      let descCount = 0;

      for (const step of log) {
        if (step.step === 'Validación de cliente') validationStep = step;
        else if (step.step === 'Análisis de referencias faltantes') missingRefStep = step;
        else if (step.step === 'Análisis de IA' || step.step.startsWith('--- INTENTO')) {
          if (step.step === 'Análisis de IA') analysisStep = step;
          else reviewSteps.push(step);
        } else if (step.step === 'Carga de Imágenes de Referencia') {
          const matchRefs = step.details.match(/Cargadas: (\d+)/);
          if (matchRefs) loadedRefs = parseInt(matchRefs[1]);
          if (step.details.includes('ACTIVA')) {
             masterPhotos = 3; // For old audits, assume it injected all since they were present
          } else {
             masterPhotos = 0;
          }
        } else if (step.step === 'Inyección de Descripciones Visuales (Texto)') {
           const matchDesc = step.details.match(/Inyectadas correctamente: (\d+)/);
           if (matchDesc) descCount = parseInt(matchDesc[1]);
        } else if (step.step === 'Referencias visuales individuales') {
           const matchRefs = step.details.match(/Cantidad: (\d+)/);
           if (matchRefs) loadedRefs = parseInt(matchRefs[1]);
           else {
             const m2 = step.details.match(/fotos: (\d+)/);
             if (m2) loadedRefs = parseInt(m2[1]);
           }
        } else if (step.step === 'Referencias de productos en góndola') {
           const matchRefs = step.details.match(/Cantidad: (\d+)/);
           if (matchRefs) masterPhotos = parseInt(matchRefs[1]);
           else {
             const m2 = step.details.match(/detectadas: (\d+)/);
             if (m2) masterPhotos = parseInt(m2[1]);
           }
        } else if (step.step === 'Descripciones visuales') {
           const matchDesc = step.details.match(/Cantidad: (\d+)/);
           if (matchDesc) descCount = parseInt(matchDesc[1]);
           else {
             const m2 = step.details.match(/inyectadas: (\d+)/);
             if (m2) descCount = parseInt(m2[1]);
           }
        }
      }

      if (validationStep) newLog.push(validationStep);
      
      newLog.push({ step: 'Prompts inyectados', status: 'OK', details: 'Los prompts fueron inyectados correctamente.' });
      newLog.push({ step: 'Referencias visuales individuales', status: 'OK', details: `Incluyendo la cantidad de fotos: ${loadedRefs}` });
      newLog.push({ step: 'Referencias de productos en góndola', status: 'OK', details: `Incluyendo la cantidad de fotos maestras detectadas: ${masterPhotos}` });
      newLog.push({ step: 'Descripciones visuales', status: 'OK', details: `Incluyendo la cantidad de descripciones inyectadas: ${descCount}` });
      
      if (missingRefStep) newLog.push(missingRefStep);
      newLog.push(...reviewSteps);
      if (analysisStep) newLog.push(analysisStep);

      return newLog;
    }
    
    return log;
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredHistory.map(h => h.id));
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

    // Actualización optimista de UI
    const idsToDelete = [...selectedIds];
    setHistory(prev => prev.filter(record => !idsToDelete.includes(record.id)));
    setSelectedIds([]);

    try {
      const res = await fetch('/api/history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });

      if (!res.ok) {
        // En caso de error, revertimos trayendo de nuevo los datos del servidor
        fetchHistory();
        alert('Error al eliminar registros');
      }
    } catch (error) {
      console.error('Error deleting records:', error);
      fetchHistory(); // Revertir en caso de fallo de red
      alert('Error al eliminar registros');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <span className="text-sm md:text-lg font-orbitron font-black tracking-tighter text-gray-900 uppercase">HawkEye</span>
            {referenceCount !== null && (
              <p 
                className="text-xs text-gray-500 mt-0.5 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={handleOpenReferenceModal}
                title="Click para gestionar referencias"
              >
                Referencia: <span className="font-medium text-gray-900 underline decoration-dotted">{referenceCount}</span>
              </p>
            )}
            <div className="mt-1 text-xs text-gray-400">
              Total de registros: {filteredHistory.length}
              {errorMsg && <span className="text-red-500 ml-2">• Error: {errorMsg}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-6 md:gap-8">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  placeholder="Buscar cliente o fecha..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-32 md:w-48 rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700"
                    title="Eliminar seleccionados"
                  >
                    <Trash2 size={14} />
                    <span className="hidden md:inline">Eliminar ({selectedIds.length})</span>
                  </button>
                )}
                <button
                  onClick={() => setShowEffectivenessModal(true)}
                  className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-800"
                  title="Log de Efectividad"
                >
                  <Activity size={14} />
                  <span className="hidden md:inline">Log Efectividad</span>
                </button>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-800"
                  title="Descargar Historial"
                >
                  <Download size={14} />
                  <span className="hidden md:inline">Descargar Historial</span>
                </button>
                <button
                  onClick={() => setShowRulesInfoModal(true)}
                  className="flex items-center gap-1.5 rounded-md bg-gray-900 px-2 py-1.5 text-xs text-white hover:bg-gray-800"
                  title="Contexto de Análisis"
                >
                  <BookOpen size={14} />
                </button>
              </div>
              <button onClick={onLogout} className="text-sm font-medium text-gray-600 hover:text-gray-900">Salir</button>
            </div>
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
                      checked={filteredHistory.length > 0 && selectedIds.length === filteredHistory.length}
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
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                      No hay auditorías registradas aún.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((item) => (
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
                        {item.usuario}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4 text-xs md:text-sm text-gray-900">
                        {item.cliente}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 md:px-6 md:py-4">
                        {(() => {
                          const details = parseDetails(item.resultado_detallado);
                          const missingCount = calculateMissingCount(details, item.manual_adjustments);
                          
                          if (missingCount === 0) {
                            return (
                              <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold leading-5 text-green-800 md:text-xs">
                                OK
                              </span>
                            );
                          } else {
                            return (
                              <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold leading-5 text-red-800 md:text-xs">
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
                            className="flex items-center justify-center rounded-md p-1.5 text-gray-900 hover:bg-gray-100 hover:text-black"
                            title="Ver Detalle"
                          >
                            <Eye size={20} />
                          </button>
                          {(() => {
                            const details = parseDetails(item.resultado_detallado);
                            const hasAdjustments = details.some((d: any) => d.manuallyAdjusted || d.manuallyRejected);
                            const hasManualAdjustments = (item.manual_adjustments && item.manual_adjustments.length > 0) || hasAdjustments;
                            
                            if (hasManualAdjustments) {
                              return (
                                <span title="Modificado manualmente" className="text-gray-400 ml-1">
                                  <Wrench size={14} />
                                </span>
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
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div ref={modalContentRef} className="bg-white rounded-t-xl">
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
                    parseProcessLog(selectedAudit.proceso_auditoria).map((step, idx) => {
                      const isSeparator = step.step.startsWith('--- INTENTO');
                      
                      if (isSeparator) {
                        return (
                          <div key={idx} className="my-6 flex items-center">
                            <div className="flex-grow border-t border-gray-300"></div>
                            <span className="mx-4 flex-shrink-0 text-sm font-bold text-gray-500 uppercase tracking-wider">
                              {step.step.replace(/---/g, '').trim()}
                            </span>
                            <div className="flex-grow border-t border-gray-300"></div>
                          </div>
                        );
                      }

                      return (
                      <div key={idx} className="flex items-start gap-4 rounded-lg border p-4 shadow-sm">
                        <div className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                          step.status === 'OK' ? 'bg-green-100 text-green-600' : 
                          step.status === 'Warning' ? 'bg-yellow-100 text-yellow-600' : 
                          'bg-red-100 text-red-600'
                        }`}>
                          {step.status === 'OK' ? '✓' : step.status === 'Warning' ? '!' : 'X'}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{step.step.replace(/Guía Maestra/g, 'Productos en Góndola Real (referencias_visuales.jpg)')}</h4>
                          <p className={`text-sm font-medium ${
                            step.status === 'OK' ? 'text-green-700' : 
                            step.status === 'Warning' ? 'text-yellow-700' : 
                            'text-red-700'
                          }`}>
                            Estado: {step.status}
                          </p>
                          {step.details && (
                            <div className="mt-1 text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 whitespace-pre-wrap">
                              {(() => {
                                const displayDetails = step.details.replace(/Guía Maestra/g, 'Productos en Góndola Real (referencias_visuales.jpg)');
                                
                                if (step.step === 'Análisis de referencias faltantes') {
                                  const parts = displayDetails.split(' | ');
                                  const detailsParsed = parseDetails(selectedAudit.resultado_detallado);
                                  const pastManualAdjs = detailsParsed.filter((d: any) => d.manuallyAdjusted || d.manuallyRejected).map((d: any) => d.productName);
                                  const manualAdjs = Array.from(new Set([
                                    ...(selectedAudit.manual_adjustments || []),
                                    ...pastManualAdjs
                                  ]));
                                  
                                  const missingPartsAI = parts.filter(p => p !== 'Todas las referencias requeridas fueron encontradas');
                                  const isMatch = (p: string, adj: string) => p === adj || p.startsWith(adj + ':');
                                  const notAdjustedParts = missingPartsAI.filter(p => !manualAdjs.some(adj => isMatch(p, adj)));

                                  const renderNotAdjustedPart = (part: string, i: number) => {
                                    const colonIndex = part.indexOf(':');
                                    let title = part;
                                    if (colonIndex !== -1) {
                                      title = part.substring(0, colonIndex);
                                    }
                                    return (
                                      <div key={i}>
                                        <span className="font-bold text-gray-800">- {title}</span>
                                      </div>
                                    );
                                  };

                                  return (
                                    <div className="space-y-4">
                                      {/* Original detection */}
                                      {missingPartsAI.length > 0 && (
                                        <div>
                                          <div className="font-bold text-gray-800 border-b border-gray-200 pb-1 mb-2">Detectado como faltante por IA:</div>
                                          <div className="space-y-1 text-red-700">
                                            {missingPartsAI.map((part, i) => renderNotAdjustedPart(part, i))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* Adjustments */}
                                      {manualAdjs.length > 0 && (
                                        <div>
                                          <div className="font-bold text-gray-800 border-b border-gray-200 pb-1 mb-2">Ajustadas por auditor:</div>
                                          <div className="space-y-1 text-blue-700">
                                            {manualAdjs.map((adj, i) => {
                                               const aiSaidMissing = missingPartsAI.some(p => isMatch(p, adj));
                                               const textState = aiSaidMissing ? "si está" : "no está";
                                               
                                               return (
                                                 <div key={i}>
                                                   <span className="font-semibold">- {adj}:</span> {textState}
                                                 </div>
                                               );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* Final Results */}
                                      {(missingPartsAI.length > 0 || manualAdjs.length > 0) && (
                                        <div className="bg-gray-200 p-3 rounded-md">
                                          <div className="font-bold text-gray-900 border-b border-gray-300 pb-1 mb-2">Resultado Final (Faltantes reales tras auditoría):</div>
                                          <div className="space-y-1 text-gray-900">
                                            {(() => {
                                              const finalMissingParts = missingPartsAI.filter(p => !manualAdjs.some(adj => isMatch(p, adj)));
                                              const aiSaidPresentButManuallyAddedAsMissing = manualAdjs.filter(adj => !missingPartsAI.some(p => isMatch(p, adj)));
                                              
                                              const finalMissingComponents = [
                                                ...finalMissingParts.map((part, i) => renderNotAdjustedPart(part, i)),
                                                ...aiSaidPresentButManuallyAddedAsMissing.map((adj, i) => (
                                                  <div key={`manual-${i}`}>
                                                    <span className="font-bold text-gray-800">- {adj}</span> <span className="text-red-600 font-medium">(marcado faltante por auditor)</span>
                                                  </div>
                                                ))
                                              ];
                                              
                                              if (finalMissingComponents.length === 0) {
                                                return <div className="text-green-700 font-semibold">Todas las referencias requeridas están presentes</div>;
                                              }
                                              
                                              return finalMissingComponents;
                                            })()}
                                          </div>
                                        </div>
                                      )}

                                      {missingPartsAI.length === 0 && manualAdjs.length === 0 && (
                                        <div className="text-green-700 font-semibold mt-1">Todas las referencias requeridas fueron encontradas</div>
                                      )}
                                    </div>
                                  );
                                } else if (displayDetails.includes('Reglas (JSON):') || displayDetails.includes('Productos en Góndola Real (referencias_visuales.jpg):') || displayDetails.includes('Refs Individuales:')) {
                                  // Split by newline or pipe for backwards compatibility
                                  const parts = displayDetails.split(/\n| \| /);
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
                                return <>{displayDetails}</>;
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    )})
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 md:gap-6 md:p-6">
                {/* Left Column: Info & Image */}
                <div className="space-y-3 md:space-y-6">
                  <div className="rounded-lg bg-gray-50 py-1.5 px-3 md:p-4">
                    <div className="flex flex-col gap-1 md:gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 overflow-hidden">
                          <p className="text-gray-400 text-[8px] md:text-xs leading-none mb-0.5">Cliente</p>
                          <p className="font-semibold text-gray-900 text-[11px] md:text-sm leading-tight truncate">{selectedAudit.cliente}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-400 text-[8px] md:text-xs leading-none mb-0.5">Usuario</p>
                          <p className="font-normal text-gray-600 text-[9px] md:text-sm leading-tight">{selectedAudit.usuario}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div>
                          <p className="text-gray-400 text-[8px] md:text-xs leading-none mb-0.5">Fecha</p>
                          <p className="font-normal text-gray-600 text-[9px] md:text-sm leading-tight">
                            {new Date(selectedAudit.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-right">
                          {(() => {
                            const details = parseDetails(selectedAudit.resultado_detallado);
                            const missingCount = calculateMissingCount(details, selectedAudit.manual_adjustments);
                            
                            const isOk = missingCount === 0;
                            
                            return (
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] md:text-sm font-bold leading-none ${
                                isOk ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {isOk ? 'OK' : `Faltan: ${missingCount}`}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 flex items-center gap-2 font-semibold text-gray-900">
                      <ImageIcon size={18} />
                      Evidencia Fotográfica
                    </h3>
                    <div className="overflow-hidden rounded-lg border bg-gray-100 min-h-[200px] flex items-center justify-center relative">
                      <img 
                        src={base64Image || selectedAudit.url_imagen} 
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
                  <div className="rounded-lg border overflow-hidden overflow-x-auto">
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
                            const isAdjustedAdminDb = selectedAudit.manual_adjustments?.includes(item.productName) || false;
                            const isManuallyAdjustedPast = item.manuallyAdjusted || item.manuallyRejected;
                            const hasAnyAdjustment = isAdjustedAdminDb || isManuallyAdjustedPast;

                            const originalPresent = item.manuallyAdjusted ? false : item.present;
                            const isEffectivelyPresent = originalPresent ? !isAdjustedAdminDb : isAdjustedAdminDb;
                            
                            return (
                              <tr 
                                key={idx} 
                                onClick={() => {
                                  if (item.required) handleAdjust(selectedAudit.id, item.productName);
                                }}
                                className={`
                                  ${isEffectivelyPresent ? 'bg-green-50/50' : item.required ? 'bg-red-50/50' : ''}
                                  ${item.required ? 'cursor-pointer hover:bg-black/5 transition-colors' : ''}
                                `}
                                title={item.required ? "Clic para cambiar estado" : ""}
                              >
                                <td className="px-2 md:px-4 py-1.5 md:py-2 text-xs md:text-sm text-gray-900">
                                  {item.productName}
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
                                {hasAnyAdjustment && (
                                    <div className="inline-flex items-center justify-center p-0.5 md:p-1 rounded-full text-amber-600">
                                      <CircleDot size={16} />
                                    </div>
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
            </div>

            <div className="border-t bg-gray-50 p-3 md:p-4 flex items-center justify-between rounded-b-xl">
              <div className="w-16 md:w-20"></div>
              
              <button
                onClick={handleDownloadJPG}
                disabled={isDownloading}
                className={`flex items-center gap-1 md:gap-2 rounded-md px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm text-white shadow-sm transition-colors ${
                  isDownloading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-gray-800'
                }`}
                title="Descargar como JPG"
              >
                {isDownloading ? (
                  <div className="h-4 w-4 md:h-5 md:w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Download size={16} className="md:w-5 md:h-5" />
                )}
                <span>{isDownloading ? 'Generando...' : 'Descargar Reporte'}</span>
              </button>

              <button
                onClick={() => setSelectedAudit(null)}
                className="w-16 md:w-20 rounded-md bg-white px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 border border-gray-300 text-center"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Effectiveness Modal */}
      {showEffectivenessModal && effectivenessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col my-8">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl shrink-0">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Activity size={20} className="text-gray-900" />
                Log de Efectividad de IA
              </h3>
              <button 
                onClick={() => setShowEffectivenessModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-4 border-b pb-2">Top Productos con Fallas</h4>
                  {effectivenessData.topProducts.length === 0 ? (
                    <p className="text-gray-500 text-sm">No se registran fallas.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 text-gray-600">
                        <tr>
                          <th className="py-2 px-3 text-left">Producto</th>
                          <th className="py-2 px-3 text-center">Fallas</th>
                          <th className="py-2 px-3 text-right">Efectividad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {effectivenessData.topProducts.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium text-gray-800">{p.name}</td>
                            <td className="py-2 px-3 text-center text-red-600 font-bold">{p.failures}</td>
                            <td className="py-2 px-3 text-right">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                parseFloat(p.effectiveness) >= 90 ? 'bg-green-100 text-green-800' :
                                parseFloat(p.effectiveness) >= 75 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {p.effectiveness}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-gray-700 mb-4 border-b pb-2">Registro Detallado</h4>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {effectivenessData.errorLogs.length === 0 ? (
                      <p className="text-gray-500 text-sm">No hay registros de fallas.</p>
                    ) : (
                      effectivenessData.errorLogs.map((log, i) => (
                        <div key={i} className="bg-white border rounded p-3 text-sm flex flex-col gap-1 shadow-sm">
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-gray-800">{log.productName}</span>
                            <span className="text-xs text-gray-500">{new Date(log.date).toLocaleDateString()} {new Date(log.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          <div className="text-xs text-gray-600">Cliente: {log.client} (ID: {log.auditId})</div>
                          <div className={`text-xs font-semibold mt-1 p-1 rounded inline-block w-fit ${
                            log.type === 'Falso Positivo' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {log.type}
                          </div>
                          <div className="text-xs grid grid-cols-2 mt-1 bg-gray-50 p-1.5 rounded">
                            <div><span className="text-gray-500">IA dijo:</span> <span className={log.iaState === 'Sí está' ? 'text-green-600' : 'text-red-600'}>{log.iaState}</span></div>
                            <div><span className="text-gray-500">Realidad:</span> <span className={log.auditorState === 'Sí está' ? 'text-green-600' : 'text-red-600'}>{log.auditorState}</span></div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end shrink-0">
              <button
                onClick={() => setShowEffectivenessModal(false)}
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm border border-gray-300 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showRulesInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b px-6 py-4 bg-gray-50/80 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-100 text-indigo-600">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 tracking-tight">Contexto de Análisis de IA</h2>
                  <p className="text-sm text-gray-500 font-medium mt-0.5">Lógica, instrucciones y prompts inyectados en la auditoría (Lectura)</p>
                </div>
              </div>
              <button 
                onClick={() => setShowRulesInfoModal(false)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-gray-50/30">
              <div className="space-y-6">
                
                <section className="bg-white border rounded-xl p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-sm font-bold">1</span>
                    Evaluación de Cliente y SKU
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">
                    Primero, el sistema identifica el ID de cliente subido y busca su configuración en la base de datos de reglas (diccionario de productos permitidos). Sólo audita los productos que la marca exige para ese local en particular.
                  </p>
                </section>

                <section className="bg-white border rounded-xl p-5 shadow-sm border-l-4 border-l-indigo-500">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-sm font-bold">2</span>
                    Inyección Visual (Guías Maestras)
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">
                    Se introducen hasta tres <strong>fotografías maestras (góndolas reales)</strong>. A la IA se le da la instrucción de que estas son "las referencias maestras y verdad absoluta". Los recuadros rojos delimitan los productos en su entorno natural con la iluminación e imperfecciones correspondientes. La IA descarta visualmente los productos restantes no enmarcados.
                  </p>
                  <div className="bg-gray-100 p-3 mt-3 rounded text-xs text-gray-700 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    "GUÍA MAESTRA DE REFERENCIAS EN GÓNDOLA... Solo las botellas que están dentro de los recuadros rojos deben utilizarse como referencia visual primaria ("la verdad absoluta") del producto en entorno de supermercado real. Ignora el resto de productos no remarcados en esta foto."
                  </div>
                </section>
                
                <section className="bg-white border rounded-xl p-5 shadow-sm border-l-4 border-l-indigo-500">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-sm font-bold">3</span>
                    Inyección de Diccionario Técnico (Texto)
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Se insertan descripciones de texto estrictas sobre proporciones y características de las botellas:
                  </p>
                  <ul className="text-sm text-gray-600 list-disc pl-5 mt-2 space-y-1 mb-3">
                    <li>Contraste de tamaños (ej. 1L vs 200ml).</li>
                    <li>Forma de siluetas (coctelera vs transparente alargada).</li>
                    <li>Color de la tapa y etiquetas.</li>
                    <li>Contraste del color de vidrio frente a iluminación artificial.</li>
                  </ul>
                  <div className="bg-gray-100 p-3 mt-3 rounded text-xs text-gray-700 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {`Para cada producto buscado, se añade una parte estricta al prompt:
"Visual description for [Nombre del Producto]: [Descripción del Diccionario]"

El diccionario completo es el siguiente:
- Gin Gordons: Forma: Botella transparente, alta (referencia 1L). CRÍTICO: Bloque blanco muy visible en el centro del cuerpo + tapa violeta. No intentar leer texto.
- Gin Tanqueray: Forma: Silueta tipo coctelera (hombros redondeados). CRÍTICO: Vidrio verde oscuro. Franja inferior plateada bajo la etiqueta principal.
- Gin Sevilla: Forma: Silueta tipo coctelera. CRÍTICO: Vidrio ámbar/naranja. Franja inferior naranja bajo la etiqueta principal.
- Gin Royale: Forma: Silueta tipo coctelera. CRÍTICO: Vidrio violeta oscuro. Franja inferior verde claro bajo la etiqueta principal.
- White Horse 1L: Forma: Cilíndrica, alta. Vidrio transparente, líquido ámbar. CRÍTICO: Etiqueta amarilla gigante que domina casi todo el frente de la botella. NO confundir con formato petaca.
- White Horse 200 ml: Forma: Rectangular, plana (tipo petaca). CRÍTICO: Botella chata. Altura a la mitad (50%) de las referencias normales.
- Vat 69 1L: Forma: Cilíndrica, alta. Vidrio verde oscuro. CRÍTICO: Etiqueta negra central con texto blanco "VAT 69" y un sello rojo en la parte superior.
- Vat 69 200 ml: Forma: Rectangular, plana (tipo petaca). Vidrio verde oscuro. CRÍTICO: Botella chata. Altura a la mitad (50%). Buscar franjas amarillas en la etiqueta (NO rojas).
- Sandy Mac 1L: Formato: Cuadrada/rectangular, ancha y robusta. Altura más baja que las botellas estándar de 1L del estante. Color: Vidrio ámbar muy oscuro. Etiquetas: Etiqueta central grande color crema/dorada. CRÍTICO: Priorizar la silueta cuadrada y robusta.
- JW Blonde: Forma: Rectangular, alta. Vidrio transparente, líquido ámbar. CRÍTICO: Franja diagonal AMARILLA cruzando la botella. Tapa azul. Es la única referencia con diagonal amarilla.
- Smirnoff Ice: Formato: Botella transparente pequeña, cuello largo. Altura aproximada 60%. Etiqueta: Centro blanco con detalles en rojo suave. CRÍTICO: Priorizar el tamaño pequeño y el contraste de la etiqueta clara.
- Vodka Smirnoff 750mL: Formato: Alta, cilíndrica, recta y muy esbelta. Detalles Visuales: Líquido transparente. Tapa roja sólida y visible. CRÍTICO: Priorizar silueta alargada transparente con botón/tapa roja.`}
                  </div>
                </section>

                <section className="bg-white border rounded-xl p-5 shadow-sm border-l-4 border-l-indigo-500">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-sm font-bold">4</span>
                    Inyección de Referencias Individuales
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">
                    Se envían las fotos de estudio de los productos. Un prompt maestro le advierte explícitamente a la IA que dependa más de la guía en góndola (fotos reales) para temas de forma o color real.
                  </p>
                  <div className="bg-gray-100 p-3 mt-3 rounded text-xs text-gray-700 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    "Imagen de estudio (fondo blanco) para [Producto]. ATENCIÓN: Esta es una imagen publicitaria. Usar solo para reconocer detalles de la etiqueta o el logo. Para determinar la forma, las proporciones reales y la iluminación, PRIORIZAR las imágenes de 'góndolas reales' enviadas anteriormente, ya que así es como se ven realmente los productos en la góndola."
                  </div>
                </section>

                <section className="bg-white border rounded-xl p-5 shadow-sm border-l-4 border-l-indigo-500">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 w-6 h-6 rounded-full inline-flex items-center justify-center text-sm font-bold">5</span>
                    Prompt Base Final Evaluativo
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                    Se le indica a Gemini el objetivo final: "Evaluar presencia o ausencia (Present | Missing) justificando de forma crítica con 2 razones visuales."
                  </p>
                  <div className="bg-gray-100 p-3 mt-3 rounded text-xs text-gray-700 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {`═══════════════════════════════
REGLAS DE IDENTIFICACIÓN
═══════════════════════════════
- IMPORTANTE: Solo identifica productos que se encuentren en la primera fila de la góndola (visibles de frente). Ignora por completo botellas ocultas, tapadas por otras o en las filas de atrás.
Basa la identificación PRINCIPALMENTE en características visuales:
- Forma y silueta de la botella
- Color del vidrio (transparente, verde oscuro, marrón oscuro, ámbar)
- Colores dominantes de la etiqueta
- Elementos distintivos: sellos, franjas, logos
- Altura relativa comparada con otras botellas
NO dependas únicamente de la lectura del texto de la etiqueta.
- IMPORTANTE SOBRE REFERENCIAS INDIVIDUALES: Ten en cuenta que las imágenes de referencia individuales provistas son fotografías de estudio; los colores, brillos, reflejos en el vidrio, sombras y la nitidez de la etiqueta varían significativamente en la foto de la góndola real bajo la iluminación artificial del local y la perspectiva de la cámara.
NO busques una coincidencia fotográfica exacta.

═══════════════════════════════
MÉTODO DE ANÁLISIS OBLIGATORIO
═══════════════════════════════

PASO 1 — Divide la góndola en zonas horizontales
Divide visualmente la imagen en zonas horizontales por estante (de arriba hacia abajo).
Examina cada estante de forma independiente. Recorre la imagen de manera sistemática de arriba hacia abajo.
NO analices toda la imagen de forma global al mismo tiempo.

PASO 2 — Clasificá las botellas por color dominante PRIMERO
Antes de identificar marcas, agrupá las botellas visibles por color de vidrio/líquido:
□ Botellas de vidrio transparente
□ Botellas de vidrio verde oscuro
□ Botellas de vidrio marrón oscuro
□ Botellas ámbar/naranja
Esta pre-clasificación reduce el espacio de búsqueda para cada producto.

PASO 3 — Detectá candidatos por estante
En cada estante, identificá botellas que podrían coincidir visualmente 
con los productos buscados.
Para cada posible coincidencia, observá:
- Forma general de la botella
- Color dominante del vidrio
- Colores de la etiqueta
- Color de la tapa
- Elementos distintivos (franjas, sellos, logos)
- Altura relativa comparada con botellas de referencia de 1L

PASO 4 — Validá las coincidencias (REGLA OBLIGATORIA)
Solo confirmá un producto si AL MENOS DOS características visuales 
coinciden con la descripción del producto.
Ejemplos de coincidencias válidas:
✓ forma de botella + color de etiqueta
✓ color del vidrio + color de tapa
✓ forma + elemento distintivo (sello, franja)
Una sola característica coincidente NO es suficiente para confirmar presencia.

═══════════════════════════════
REFERENCIAS DE ESCALA
═══════════════════════════════
Usá el tamaño relativo entre botellas para estimar el volumen:
- Botellas 1L → las más altas (~30–32 cm de referencia)
- Botellas 750ml → levemente más bajas que las de 1L
- Botellas 200ml → aproximadamente el 50% de la altura de una botella de 1L
- Botellas 275ml (Smirnoff Ice) → aproximadamente el 60% de una botella de 1L

Esto es clave para diferenciar:
- Vat 69 1L vs Vat 69 200ml (misma etiqueta, tamaño muy diferente)
- White Horse 1L vs White Horse 200ml
- Smirnoff Ice (275ml, botella tipo cerveza) vs botellas de tamaño completo

═══════════════════════════════
FORMATO DE SALIDA
═══════════════════════════════
Devolvé un objeto JSON donde las claves sean los nombres exactos de los productos buscados.
Cada valor DEBE ser un objeto con:
1. "status": "Present" (Presente) o "Missing" (Faltante)
2. "reason": explicación breve citando las DOS características visuales 
que confirmaron la presencia, o por qué no fue encontrado.

DEVUELVE ÚNICA Y EXCLUSIVAMENTE EL OBJETO JSON. NO incluyas texto antes ni después, ni bloques de código markdown.`}
                  </div>
                </section>

              </div>
            </div>
            
            <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end shrink-0">
              <button
                onClick={() => setShowRulesInfoModal(false)}
                className="rounded-md bg-white px-5 py-2 text-sm font-medium text-gray-700 shadow-sm border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Cerrar Entendimiento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
