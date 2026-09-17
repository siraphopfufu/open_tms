import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, RefreshCw, Truck, Users } from 'lucide-react';

import { API_URL } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface BoardItem {
  id: string;
  reference?: string;
  status: string;
  proNumber?: string | null;
  customerName: string;
  originCity: string | null;
  destinationCity: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  carrierName: string | null;
  tractorPlate: string | null;
  trailerPlate: string | null;
  driverName: string | null;
}

interface Board {
  unassigned: BoardItem[];
  ownFleet: BoardItem[];
  subcontractor: BoardItem[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  ready: 'Ready',
  in_progress: 'In Transit',
};

function ShipmentCard({ item, onClick }: { item: BoardItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card p-3 hover:border-primary/50 hover:shadow-sm transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">{item.reference || item.id.slice(0, 8)}</span>
        <Badge variant="outline" className="text-xs">{STATUS_LABELS[item.status] || item.status}</Badge>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{item.customerName}</div>
      <div className="text-xs text-muted-foreground">
        {item.originCity || '—'} <span className="mx-1">→</span> {item.destinationCity || '—'}
      </div>
      {(item.tractorPlate || item.driverName) && (
        <div className="mt-2 pt-2 border-t text-xs space-y-0.5">
          {item.carrierName && <div className="text-muted-foreground">{item.carrierName}</div>}
          {(item.tractorPlate || item.trailerPlate) && (
            <div>
              {item.tractorPlate} {item.trailerPlate ? `/ ${item.trailerPlate}` : ''}
            </div>
          )}
          {item.driverName && <div className="text-muted-foreground">{item.driverName}</div>}
        </div>
      )}
    </button>
  );
}

function BoardColumn({
  title,
  icon: Icon,
  items,
  emptyLabel,
  accent,
  onSelect,
}: {
  title: string;
  icon: React.ElementType;
  items: BoardItem[];
  emptyLabel: string;
  accent: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="flex-1 min-w-[280px]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={`h-4 w-4 ${accent}`} />
          {title}
          <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">{emptyLabel}</div>
        )}
        {items.map(item => (
          <ShipmentCard key={item.id} item={item} onClick={() => onSelect(item.id)} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function VNextDispatchBoard() {
  const navigate = useNavigate();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/v1/dispatch/board`)
      .then(res => res.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setBoard(json.data);
      })
      .catch(err => setError(err.message || 'Failed to load dispatch board'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dispatch Board</h1>
          <p className="text-sm text-muted-foreground">
            Job booking &amp; dispatch — assign each shipment to the company fleet or a subcontractor (รถร่วม).
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
          <BoardColumn
            title="Needs Assignment"
            icon={AlertCircle}
            items={board.unassigned}
            emptyLabel="Nothing waiting on dispatch"
            accent="text-amber-500"
            onSelect={id => navigate(`/shipments/${id}?tab=dispatch`)}
          />
          <BoardColumn
            title="Company Fleet"
            icon={Truck}
            items={board.ownFleet}
            emptyLabel="No shipments on the own fleet"
            accent="text-blue-500"
            onSelect={id => navigate(`/shipments/${id}?tab=dispatch`)}
          />
          <BoardColumn
            title="Subcontractor"
            icon={Users}
            items={board.subcontractor}
            emptyLabel="No shipments on subcontractors"
            accent="text-purple-500"
            onSelect={id => navigate(`/shipments/${id}?tab=dispatch`)}
          />
        </div>
      ) : null}
    </div>
  );
}
