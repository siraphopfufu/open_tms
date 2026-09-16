import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Fuel, Loader2, RefreshCw, Wallet } from 'lucide-react';

import { API_URL } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NeedsAdvanceItem {
  shipmentId: string;
  reference?: string;
  driverName: string | null;
  tractorPlate: string | null;
  laneDistanceKm: number | null;
  vehicleKmPerLiter: number | null;
}

interface AwaitingSettlementItem extends NeedsAdvanceItem {
  totalAdvanceCents: number | null;
}

interface SettledItem {
  shipmentId: string;
  reference?: string;
  driverName: string | null;
  netSettlementCents: number;
  isOverBenchmark: boolean;
  settledAt: string;
}

interface Board {
  needsAdvance: NeedsAdvanceItem[];
  awaitingSettlement: AwaitingSettlementItem[];
  settled: SettledItem[];
}

const bahtToCents = (v: string) => Math.round((parseFloat(v) || 0) * 100);
const centsToBaht = (c: number | null) => (c == null ? '—' : `฿${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function AdvanceForm({ item, onDone }: { item: NeedsAdvanceItem; onDone: () => void }) {
  const [fuelEstimate, setFuelEstimate] = useState('');
  const [tollEstimate, setTollEstimate] = useState('');
  const [allowance, setAllowance] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/v1/shipments/${item.shipmentId}/driver-advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fuelEstimateCents: bahtToCents(fuelEstimate),
          tollEstimateCents: bahtToCents(tollEstimate),
          allowanceCents: allowance ? bahtToCents(allowance) : undefined,
          transferMethod: 'cash',
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      // The desk hands over cash the moment the advance is approved — mark
      // it transferred in the same action instead of a separate click.
      await fetch(`${API_URL}/api/v1/shipments/${item.shipmentId}/driver-advance/transfer`, { method: 'POST' });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed to record advance');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Fuel est. (฿)</Label>
          <Input type="number" min="0" value={fuelEstimate} onChange={e => setFuelEstimate(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label className="text-xs">Toll est. (฿)</Label>
          <Input type="number" min="0" value={tollEstimate} onChange={e => setTollEstimate(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label className="text-xs">Allowance (฿)</Label>
          <Input type="number" min="0" value={allowance} onChange={e => setAllowance(e.target.value)} placeholder="Standard" />
        </div>
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
      <Button size="sm" className="w-full" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Give Advance (Cash)'}
      </Button>
    </div>
  );
}

function SettlementForm({ item, onDone }: { item: AwaitingSettlementItem; onDone: () => void }) {
  const [distanceKm, setDistanceKm] = useState(item.laneDistanceKm != null ? String(item.laneDistanceKm) : '');
  const [dieselPrice, setDieselPrice] = useState('32');
  const [fuelLiters, setFuelLiters] = useState('');
  const [tollActual, setTollActual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (fuelLiters && parseFloat(fuelLiters) > 0) {
        await fetch(`${API_URL}/api/v1/shipments/${item.shipmentId}/fuel-transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ liters: parseFloat(fuelLiters), pricePerLiterCents: bahtToCents(dieselPrice) }),
        });
      }
      const res = await fetch(`${API_URL}/api/v1/shipments/${item.shipmentId}/trip-settlement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distanceKm: parseFloat(distanceKm) || 0,
          dieselPriceCentsPerLiter: bahtToCents(dieselPrice),
          vehicleKmPerLiter: item.vehicleKmPerLiter ?? undefined,
          actualTollCents: bahtToCents(tollActual),
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResult(json.data);
      await fetch(`${API_URL}/api/v1/shipments/${item.shipmentId}/trip-settlement/settle`, { method: 'POST' });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed to settle trip');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Distance (km)</Label>
          <Input type="number" min="0" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Diesel price (฿/L)</Label>
          <Input type="number" min="0" step="0.01" value={dieselPrice} onChange={e => setDieselPrice(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Fuel receipt (liters)</Label>
          <Input type="number" min="0" value={fuelLiters} onChange={e => setFuelLiters(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label className="text-xs">Actual toll (฿)</Label>
          <Input type="number" min="0" value={tollActual} onChange={e => setTollActual(e.target.value)} placeholder="0" />
        </div>
      </div>
      {result && (
        <div className={`text-xs rounded p-2 ${result.isOverBenchmark ? 'bg-destructive/10 text-destructive' : 'bg-muted'}`}>
          Expected fuel: {centsToBaht(result.expectedFuelCostCents)} · Actual: {centsToBaht(result.actualFuelCostCents)}
          {' '}({result.fuelVariancePercent >= 0 ? '+' : ''}{result.fuelVariancePercent.toFixed(1)}%)
          {result.isOverBenchmark && ' — over benchmark'}
        </div>
      )}
      {error && <div className="text-xs text-destructive">{error}</div>}
      <Button size="sm" className="w-full" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Calculate & Settle'}
      </Button>
    </div>
  );
}

export default function VNextCashDesk() {
  const navigate = useNavigate();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/v1/cash-desk/board`)
      .then(res => res.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setBoard(json.data);
      })
      .catch(err => setError(err.message || 'Failed to load cash desk'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const onDone = () => {
    setExpanded(null);
    load();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Daily Cash Desk</h1>
          <p className="text-sm text-muted-foreground">
            Morning driver advances &amp; evening fuel settlement — one worklist instead of opening every trip.
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

      {loading && !board ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : board ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          <Card className="flex-1 min-w-[300px]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4 text-amber-500" /> Needs Advance
                <Badge variant="secondary" className="ml-auto">{board.needsAdvance.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
              {board.needsAdvance.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">All trips have an advance</div>
              )}
              {board.needsAdvance.map(item => (
                <div key={item.shipmentId} className="rounded-lg border bg-card p-3">
                  <button className="w-full text-left" onClick={() => navigate(`/shipments/${item.shipmentId}`)}>
                    <div className="font-medium text-sm">{item.reference || item.shipmentId.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{item.driverName || 'No driver'} · {item.tractorPlate || '—'}</div>
                  </button>
                  {expanded === item.shipmentId ? (
                    <AdvanceForm item={item} onDone={onDone} />
                  ) : (
                    <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => setExpanded(item.shipmentId)}>
                      Give Advance
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="flex-1 min-w-[320px]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Fuel className="h-4 w-4 text-blue-500" /> Awaiting Settlement
                <Badge variant="secondary" className="ml-auto">{board.awaitingSettlement.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
              {board.awaitingSettlement.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">Nothing waiting on receipts</div>
              )}
              {board.awaitingSettlement.map(item => (
                <div key={item.shipmentId} className="rounded-lg border bg-card p-3">
                  <button className="w-full text-left" onClick={() => navigate(`/shipments/${item.shipmentId}`)}>
                    <div className="font-medium text-sm">{item.reference || item.shipmentId.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{item.driverName || 'No driver'} · Advance: {centsToBaht(item.totalAdvanceCents)}</div>
                  </button>
                  {expanded === item.shipmentId ? (
                    <SettlementForm item={item} onDone={onDone} />
                  ) : (
                    <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => setExpanded(item.shipmentId)}>
                      Settle
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="flex-1 min-w-[280px]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Settled
                <Badge variant="secondary" className="ml-auto">{board.settled.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
              {board.settled.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">No settlements yet</div>
              )}
              {board.settled.map(item => (
                <button
                  key={item.shipmentId}
                  onClick={() => navigate(`/shipments/${item.shipmentId}`)}
                  className="w-full text-left rounded-lg border bg-card p-3 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{item.reference || item.shipmentId.slice(0, 8)}</span>
                    {item.isOverBenchmark && <Badge variant="destructive" className="text-xs">Over benchmark</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{item.driverName || '—'}</div>
                  <div className="text-xs mt-1">
                    {item.netSettlementCents >= 0
                      ? <span>Driver returns {centsToBaht(item.netSettlementCents)}</span>
                      : <span>Company tops up {centsToBaht(Math.abs(item.netSettlementCents))}</span>}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
