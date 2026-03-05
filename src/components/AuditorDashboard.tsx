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

  useEffect(() => {
    fetch('/api/clients')
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setClients(data);
        } else {
          console.error('Data is not an array:', data);
          setClients([]);
        }
      })
      .catch(err => {
        console.error('Error fetching clients:', err);
        setClients([]);
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
      
      if (!res.ok) throw new Error('Error en la auditoría');
      
      const data = await res.json();
      setResult(data);
    } catch (error) {
      console.error(error);
      alert('Error al enviar la auditoría');
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
        <div className="mx-auto max-w-2xl rounded-xl bg-white p-6 shadow-md">
          <div className="mb-6 text-center">
            {result.globalResult === 'OK' ? (
              <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
            ) : (
              <XCircle className="mx-auto h-16 w-16 text-red-500" />
            )}
            <h2 className="mt-4 text-2xl font-bold">
              Resultado: {result.globalResult}
            </h2>
          </div>

          <div className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">Detalle:</h3>
            <div className="grid gap-2">
              {result.detailedResult.map((item, idx) => (
                <div key={idx} className={`flex items-center justify-between rounded p-2 ${item.present ? 'bg-green-50' : item.required ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <span className="font-medium">{item.productName}</span>
                  <span className={`text-sm ${item.present ? 'text-green-700' : item.required ? 'text-red-700' : 'text-gray-500'}`}>
                    {item.present ? 'Presente' : item.required ? 'Falta' : 'No Requerido'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={resetForm}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Nueva Auditoría
          </button>
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
                        capture="environment"
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
