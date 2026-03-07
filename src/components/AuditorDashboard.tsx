import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Camera, Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { ClientRule, AuditResult, ProductStatus } from '../types';

interface AuditorDashboardProps {
  onLogout: () => void;
}

export default function AuditorDashboard({ onLogout }: AuditorDashboardProps) {
  const [auditorId, setAuditorId] = useState('1');
  const [clients, setClients] = useState<ClientRule[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    globalResult: string;
    detailedResult: ProductStatus[];
    fileUrl: string;
  } | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      const originalFile = e.target.files[0];
      
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
  };

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-md space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Resultado Auditoría</h1>
            <button onClick={onLogout} className="text-sm text-gray-500 hover:text-gray-700">Salir</button>
          </div>

          <div className="w-full rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-4 text-center">
              {result.globalResult === 'OK' ? (
                <CheckCircle className="mx-auto h-10 w-10 text-green-500" />
              ) : (
                <XCircle className="mx-auto h-10 w-10 text-red-500" />
              )}
              <h2 className="mt-2 text-lg font-bold">
                Resultado: {result.globalResult}
              </h2>
            </div>

            <div className="mb-4 max-h-[60vh] overflow-y-auto">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Detalle:</h3>
              <div className="grid grid-cols-2 gap-2">
                {[...result.detailedResult].sort((a, b) => {
                  // Priority: 0 = Falta (Required & !Present), 1 = Presente, 2 = Others
                  const pA = (a.required && !a.present) ? 0 : (a.present ? 1 : 2);
                  const pB = (b.required && !b.present) ? 0 : (b.present ? 1 : 2);
                  return pA - pB;
                }).map((item, idx) => (
                  <div key={idx} className={`flex flex-col rounded p-2 text-xs border ${item.present ? 'bg-green-50 border-green-100' : item.required ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium truncate text-sm" title={item.productName}>{item.productName}</span>
                      <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${item.present ? 'bg-green-200 text-green-800' : item.required ? 'bg-red-200 text-red-800' : 'text-gray-400'}`}>
                        {item.present ? 'Presente' : item.required ? 'Falta' : '-'}
                      </span>
                    </div>
                    {item.reason && (
                      <div className="mt-2 border-t border-black/5 pt-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Análisis IA:</span>
                        <p className="text-gray-700 italic leading-tight">
                          "{item.reason}"
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={resetForm}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
            >
              Nueva Auditoría
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Sesión Auditor</h1>
          <button onClick={onLogout} className="text-sm text-gray-500 hover:text-gray-700">Salir</button>
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
                {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                  <option key={num} value={num}>Auditor {num}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Cliente</label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
              <div className="flex justify-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-10">
                <div className="text-center">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="mx-auto max-h-64 rounded-lg object-contain" />
                  ) : (
                    <Camera className="mx-auto h-12 w-12 text-gray-400" />
                  )}
                  <div className="mt-4 flex justify-center text-sm leading-6 text-gray-600">
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
                    <p className="pl-1">o arrastrar y soltar</p>
                  </div>
                  <p className="text-xs leading-5 text-gray-600">PNG, JPG hasta 10MB</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!file || !selectedClient || loading}
              className="flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:bg-gray-400"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                'Enviar Auditoría'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
