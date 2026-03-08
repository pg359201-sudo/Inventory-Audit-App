export interface ClientRule {
  "Codigo FEMSA": string;
  "Nombre Store": string;
  "Gin Gordons": string;
  "Gin Tanqueray": string;
  "Gin Royale": string;
  "Gin Sevilla": string;
  "JW Blonde": string;
  "Smirnoff Ice": string;
  "Vodka Smirnoff 750mL": string;
  "Black & White 1L": string;
  "JW Black 1L": string;
  "JW Red 1L": string;
  "Sandy Mac 1L": string;
  "Vat 69 1L": string;
  "Vat 69 200 ml": string;
  "White Horse 1L": string;
  "ruta de venta": string;
}

export interface AuditProcessStep {
  step: string;
  status: 'OK' | 'Error' | 'Warning';
  details?: string;
}

export interface AuditResult {
  id: number;
  usuario: string;
  fecha: string;
  cliente: string;
  resultado_detallado: string; // JSON string
  resultado_global: string;
  url_imagen: string;
  proceso_auditoria?: string; // JSON string of AuditProcessStep[]
  source?: 'db' | 'memory';
}

export interface ProductStatus {
  productName: string;
  required: boolean;
  present: boolean;
  reason?: string;
}
