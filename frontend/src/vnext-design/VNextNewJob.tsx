import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';

import { API_URL } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CONTAINER_SIZES = ['20GP', '40GP', '40HC', '40RF'];

interface ContainerRow {
  sizeType: string;
  bookingNumber: string;
  containerNumber: string;
  sealNumber: string;
  revenue: string;
}

function newRow(defaultBooking: string): ContainerRow {
  return { sizeType: '40HC', bookingNumber: defaultBooking, containerNumber: '', sealNumber: '', revenue: '' };
}

export default function VNextNewJob() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [direction, setDirection] = useState('import');
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [containers, setContainers] = useState<ContainerRow[]>([newRow('')]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/v1/customers`).then(r => r.json()).then(j => setCustomers(j.data || [])).catch(() => {});
    fetch(`${API_URL}/api/v1/locations`).then(r => r.json()).then(j => setLocations(j.data || [])).catch(() => {});
  }, []);

  const updateRow = (i: number, patch: Partial<ContainerRow>) => {
    setContainers(rows => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRow = () => setContainers(rows => [...rows, newRow(poNumber)]);
  const removeRow = (i: number) => setContainers(rows => rows.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!customerId) { setError('กรุณาเลือกลูกค้า'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/v1/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          poNumber: poNumber || undefined,
          direction,
          originId: originId || undefined,
          destinationId: destinationId || undefined,
          containers: containers.map(c => ({
            sizeType: c.sizeType,
            bookingNumber: c.bookingNumber || poNumber || undefined,
            containerNumber: c.containerNumber ? c.containerNumber.toUpperCase() : undefined,
            sealNumber: c.sealNumber || undefined,
            revenueCents: c.revenue ? Math.round(parseFloat(c.revenue) * 100) : undefined,
          })),
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      navigate(`/jobs/${json.data.orderId}`);
    } catch (e: any) {
      setError(e.message || 'เปิดงานไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">เปิดงานใหม่</h1>
        <p className="mt-1 text-sm text-muted-foreground">กรอกข้อมูลงานและตู้คอนเทนเนอร์ในหน้าเดียว</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">ข้อมูลงาน</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>ลูกค้า</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="เลือกลูกค้า..." /></SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>เลขที่ Booking</Label>
            <Input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="BKG-2026-00142" />
          </div>
          <div className="space-y-2">
            <Label>ประเภทงาน</Label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="import">ขาเข้า (นำเข้า)</SelectItem>
                <SelectItem value="export">ขาออก (ส่งออก)</SelectItem>
                <SelectItem value="reposition">ย้ายตู้เปล่า</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>ต้นทาง</Label>
            <Select value={originId} onValueChange={setOriginId}>
              <SelectTrigger><SelectValue placeholder="เลือกสถานที่..." /></SelectTrigger>
              <SelectContent>
                {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>ปลายทาง</Label>
            <Select value={destinationId} onValueChange={setDestinationId}>
              <SelectTrigger><SelectValue placeholder="เลือกสถานที่..." /></SelectTrigger>
              <SelectContent>
                {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">ตู้คอนเทนเนอร์ ({containers.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="h-4 w-4" /> เพิ่มตู้
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {containers.map((c, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-6 items-end rounded-lg border p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">ขนาดตู้</Label>
                <Select value={c.sizeType} onValueChange={v => updateRow(i, { sizeType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTAINER_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">เลข Booking</Label>
                <Input value={c.bookingNumber} onChange={e => updateRow(i, { bookingNumber: e.target.value })} placeholder={poNumber || 'BKG-...'} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">เลขตู้</Label>
                <Input value={c.containerNumber} onChange={e => updateRow(i, { containerNumber: e.target.value.toUpperCase() })} placeholder="ยังไม่ทราบก็ได้" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">เบอร์ซีล</Label>
                <Input value={c.sealNumber} onChange={e => updateRow(i, { sealNumber: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ค่าระวาง (บาท)</Label>
                <Input type="number" min="0" value={c.revenue} onChange={e => updateRow(i, { revenue: e.target.value })} placeholder="15000" />
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeRow(i)} disabled={containers.length === 1}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={busy}>
          {busy ? 'กำลังเปิดงาน...' : 'เปิดงาน'}
        </Button>
      </div>
    </div>
  );
}
