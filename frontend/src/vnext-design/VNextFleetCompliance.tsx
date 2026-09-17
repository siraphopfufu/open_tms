import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Shield } from 'lucide-react';

import { API_URL } from '../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'ok' | 'unset';

interface ComplianceRow {
  id: string;
  plate: string;
  type: string;
  carrierName: string;
  isOwnFleet: boolean;
  taxExpiryDate: string | null;
  taxStatus: ExpiryStatus;
  insuranceExpiryDate: string | null;
  insuranceStatus: ExpiryStatus;
  inspectionExpiryDate: string | null;
  inspectionStatus: ExpiryStatus;
  worstStatus: ExpiryStatus;
}

const STATUS_BADGE: Record<ExpiryStatus, { variant: any; label: string }> = {
  expired: { variant: 'destructive', label: 'Expired' },
  critical: { variant: 'destructive', label: 'Due soon' },
  warning: { variant: 'warning', label: 'Due' },
  ok: { variant: 'success', label: 'OK' },
  unset: { variant: 'muted', label: 'Not set' },
};

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function ExpiryCell({
  date,
  status,
  onSave,
}: {
  date: string | null;
  status: ExpiryStatus;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toDateInputValue(date));

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="h-8 w-36"
          autoFocus
        />
        <Button size="sm" className="h-8" onClick={() => { onSave(value); setEditing(false); }}>Save</Button>
      </div>
    );
  }

  const badge = STATUS_BADGE[status];
  return (
    <button className="flex items-center gap-2 hover:underline" onClick={() => setEditing(true)}>
      <Badge variant={badge.variant}>{badge.label}</Badge>
      <span className="text-xs text-muted-foreground">
        {date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Set date'}
      </span>
    </button>
  );
}

export default function VNextFleetCompliance() {
  const [rows, setRows] = useState<ComplianceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/v1/fleet/compliance`)
      .then(res => res.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setRows(json.data);
      })
      .catch(err => setError(err.message || 'Failed to load fleet compliance'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const saveField = async (vehicleId: string, field: string, value: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/vehicles/${vehicleId}/compliance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      load();
    } catch (err: any) {
      alert(err.message || 'Failed to save');
    }
  };

  const flaggedCount = rows?.filter(r => ['expired', 'critical', 'warning'].includes(r.worstStatus)).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fleet Compliance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tax, insurance, and ตรอ inspection renewals — orange at 30 days out, red at 7.
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

      {loading && !rows ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : rows ? (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            {flaggedCount > 0
              ? `${flaggedCount} vehicle${flaggedCount > 1 ? 's need' : ' needs'} attention`
              : 'Every tracked date is current'}
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plate</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Fleet</TableHead>
                    <TableHead>Tax Disc</TableHead>
                    <TableHead>Insurance</TableHead>
                    <TableHead>ตรอ Inspection</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono font-medium">{r.plate}</TableCell>
                      <TableCell className="capitalize">{r.type}</TableCell>
                      <TableCell>
                        <div className="text-sm">{r.carrierName}</div>
                        <Badge variant={r.isOwnFleet ? 'info' : 'muted'} className="text-xs">
                          {r.isOwnFleet ? 'Company Fleet' : 'Subcontractor'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ExpiryCell date={r.taxExpiryDate} status={r.taxStatus} onSave={v => saveField(r.id, 'taxExpiryDate', v)} />
                      </TableCell>
                      <TableCell>
                        <ExpiryCell date={r.insuranceExpiryDate} status={r.insuranceStatus} onSave={v => saveField(r.id, 'insuranceExpiryDate', v)} />
                      </TableCell>
                      <TableCell>
                        <ExpiryCell date={r.inspectionExpiryDate} status={r.inspectionStatus} onSave={v => saveField(r.id, 'inspectionExpiryDate', v)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
