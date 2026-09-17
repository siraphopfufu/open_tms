import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw } from 'lucide-react';

import { API_URL } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface LedgerItem {
  shipmentId: string;
  reference?: string;
  customerName: string;
  originCity: string | null;
  destinationCity: string | null;
  completedAt: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
}

interface Ledger {
  unbilled: LedgerItem[];
  billed: LedgerItem[];
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function VNextUnbilledLedger() {
  const navigate = useNavigate();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/v1/finance/unbilled-ledger`)
      .then(res => res.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setLedger(json.data);
      })
      .catch(err => setError(err.message || 'Failed to load ledger'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Unbilled Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Completed trips split by billing status — so nothing finished falls through the cracks before month-end.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading && !ledger ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : ledger ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4 text-amber-500" /> Pending / Unbilled
                <Badge variant="secondary" className="ml-auto">{ledger.unbilled.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
              {ledger.unbilled.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">Everything completed has been billed</div>
              )}
              {ledger.unbilled.map(item => (
                <button
                  key={item.shipmentId}
                  onClick={() => navigate(`/shipments/${item.shipmentId}`)}
                  className="w-full text-left rounded-lg border bg-card p-3 hover:border-primary/50 transition-colors"
                >
                  <div className="font-medium text-sm">{item.reference || item.shipmentId.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{item.customerName}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.originCity || '—'} <span className="mx-1">→</span> {item.destinationCity || '—'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Completed {formatDate(item.completedAt)}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Billed
                <Badge variant="secondary" className="ml-auto">{ledger.billed.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
              {ledger.billed.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">No completed trips billed yet</div>
              )}
              {ledger.billed.map(item => (
                <button
                  key={item.shipmentId}
                  onClick={() => item.invoiceId && navigate(`/finance/invoices/${item.invoiceId}`)}
                  className="w-full text-left rounded-lg border bg-card p-3 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{item.reference || item.shipmentId.slice(0, 8)}</span>
                    <Badge variant="outline" className="text-xs font-mono">{item.invoiceNumber}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{item.customerName}</div>
                  <div className="text-xs text-muted-foreground mt-1">Completed {formatDate(item.completedAt)}</div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
