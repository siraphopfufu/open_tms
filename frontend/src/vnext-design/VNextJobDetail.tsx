import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, FileText, Link2, Loader2, Paperclip, Upload } from 'lucide-react';

import { API_URL } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function baht(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `฿${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const bahtToCents = (v: string) => Math.round((parseFloat(v) || 0) * 100);

// ─── Status strip: six chips, all derived, none set by hand ─────────────────
function StatusStrip({ c }: { c: any }) {
  const chips: { label: string; ok: boolean | null; text: string }[] = [
    { label: 'ขนส่ง', ok: c.status === 'complete', text: c.status === 'complete' ? 'ส่งถึงแล้ว' : c.status === 'in_progress' ? 'กำลังขนส่ง' : 'ยังไม่ออกรถ' },
    { label: 'เอกสาร', ok: c.podReceived, text: c.podReceived ? `แนบแล้ว (${c.attachmentCount})` : 'ขาดใบส่งของ' },
    { label: 'ค่าใช้จ่าย', ok: c.netSettlementCents != null, text: c.netSettlementCents != null ? 'เคลียร์บิลแล้ว' : 'ยังไม่เคลียร์บิล' },
    { label: 'วางบิล', ok: !!c.invoiceNumber, text: c.invoiceNumber || (c.status === 'complete' && c.podReceived && c.revenueCents > 0 ? 'พร้อมวางบิล' : 'ยังวางไม่ได้') },
    { label: 'รับเงิน', ok: c.invoiceStatus === 'paid', text: c.invoiceStatus === 'paid' ? 'รับเงินแล้ว' : c.invoiceNumber ? 'รอรับเงิน' : '—' },
    { label: 'จ่ายรถร่วม', ok: c.vehicle?.isOwnFleet ? null : (c.netSettlementCents != null ? true : null), text: c.vehicle?.isOwnFleet ? 'รถบริษัท' : (c.netSettlementCents != null ? 'เคลียร์แล้ว' : 'รอเคลียร์') },
  ];

  let nextAction = '';
  if (!c.vehicle) nextAction = 'ยังไม่จัดรถ';
  else if (c.status !== 'complete') nextAction = 'ยังไม่ส่งถึง';
  else if (!c.advance) nextAction = 'ยังไม่เบิกเงินทดรอง';
  else if (c.netSettlementCents == null) nextAction = 'ยังไม่เคลียร์บิล';
  else if (!c.podReceived) nextAction = `ขาดใบส่งของ: ${c.reference}`;
  else if (c.revenueCents <= 0) nextAction = `ยังไม่ได้ตั้งค่าระวาง: ${c.reference}`;
  else if (!c.invoiceNumber) nextAction = 'พร้อมวางบิล';
  else nextAction = 'เรียบร้อย';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {chips.map(chip => (
          <Badge key={chip.label} variant={chip.ok === true ? 'success' : chip.ok === false ? 'warning' : 'muted'} className="text-xs">
            {chip.label}: {chip.text}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">ขั้นตอนถัดไป: {nextAction}</p>
    </div>
  );
}

// ─── Dispatch: assign company truck/driver or type a new subcontractor ──────
function DispatchSection({ shipmentId, c, onDone }: { shipmentId: string; c: any; onDone: () => void }) {
  const [carriers, setCarriers] = useState<any[]>([]);
  const [fleetType, setFleetType] = useState<'own' | 'subcontractor'>('own');
  const [carrierId, setCarrierId] = useState('');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [trailerPlate, setTrailerPlate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [showNewCarrier, setShowNewCarrier] = useState(false);
  const [newCarrierName, setNewCarrierName] = useState('');
  const [newCarrierPlate, setNewCarrierPlate] = useState('');
  const [newCarrierTaxId, setNewCarrierTaxId] = useState('');
  const [newCarrierPhone, setNewCarrierPhone] = useState('');
  const [newCarrierNationalId, setNewCarrierNationalId] = useState('');
  const [newCarrierTrailerPlate, setNewCarrierTrailerPlate] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/v1/carriers`).then(r => r.json()).then(j => setCarriers(j.data || [])).catch(() => {});
    fetch(`${API_URL}/api/v1/fleet/driver-availability`).then(r => r.json()).then(j => setAvailability(j.data || [])).catch(() => {});
  }, []);

  const loadFleetData = useCallback((cid: string) => {
    if (!cid) { setVehicles([]); setDrivers([]); return; }
    Promise.all([
      fetch(`${API_URL}/api/v1/carriers/${cid}/vehicles`).then(r => r.json()),
      fetch(`${API_URL}/api/v1/carriers/${cid}/drivers`).then(r => r.json()),
    ]).then(([v, d]) => { setVehicles(v.data || []); setDrivers(d.data || []); }).catch(() => {});
  }, []);
  useEffect(() => { loadFleetData(carrierId); }, [carrierId, loadFleetData]);

  const filteredCarriers = carriers.filter(cc => (fleetType === 'own' ? cc.isOwnFleet : !cc.isOwnFleet));
  const availabilityByDriverId = new Map(availability.map(a => [a.id, a]));

  const createSubcontractorAndAssign = async () => {
    if (!newCarrierName.trim() || !newCarrierPlate.trim()) return;
    setBusy(true);
    setError('');
    try {
      const carrierRes = await fetch(`${API_URL}/api/v1/carriers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCarrierName,
          taxId: newCarrierTaxId || undefined,
          nationalId: newCarrierNationalId || undefined,
          contactPhone: newCarrierPhone || undefined,
          isOwnFleet: false, country: 'Thailand', currency: 'THB',
        }),
      });
      const carrierJson = await carrierRes.json();
      if (carrierJson.error) throw new Error(carrierJson.error);
      const vehicleRes = await fetch(`${API_URL}/api/v1/carriers/${carrierJson.data.id}/vehicles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: newCarrierPlate, type: 'tractor' }),
      });
      const vehicleJson = await vehicleRes.json();
      if (vehicleJson.error) throw new Error(vehicleJson.error);
      const assignRes = await fetch(`${API_URL}/api/v1/shipments/${shipmentId}/load`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: vehicleJson.data.id, trailerPlate: newCarrierTrailerPlate || undefined }),
      });
      const assignJson = await assignRes.json();
      if (assignJson.error) throw new Error(assignJson.error);
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const assign = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/v1/shipments/${shipmentId}/load`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: vehicleId || undefined, driverId: driverId || undefined, trailerPlate: trailerPlate || undefined }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (c.vehicle) {
    return (
      <div className="text-sm space-y-1">
        <div><span className="text-muted-foreground">รถ:</span> {c.vehicle.plate} ({c.vehicle.isOwnFleet ? 'รถบริษัท' : c.vehicle.carrierName})</div>
        {c.driver && <div><span className="text-muted-foreground">คนขับ:</span> {c.driver.name}</div>}
        {c.trailerPlate && <div><span className="text-muted-foreground">หาง:</span> {c.trailerPlate}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div className="flex gap-2">
        <Button size="sm" variant={fleetType === 'own' ? 'default' : 'outline'} onClick={() => { setFleetType('own'); setCarrierId(''); }}>รถบริษัท</Button>
        <Button size="sm" variant={fleetType === 'subcontractor' ? 'default' : 'outline'} onClick={() => { setFleetType('subcontractor'); setCarrierId(''); setShowNewCarrier(true); }}>รถร่วม</Button>
      </div>

      {fleetType === 'own' ? (
        <>
          <Select value={carrierId} onValueChange={setCarrierId}>
            <SelectTrigger><SelectValue placeholder="เลือกบริษัทรถ..." /></SelectTrigger>
            <SelectContent>
              {filteredCarriers.map(cc => <SelectItem key={cc.id} value={cc.id}>{cc.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {carrierId && (
            <>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger><SelectValue placeholder="เลือกรถหัวลาก..." /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger><SelectValue placeholder="เลือกคนขับ..." /></SelectTrigger>
                <SelectContent>
                  {drivers.map(d => {
                    const avail = availabilityByDriverId.get(d.id);
                    return (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} {avail ? (avail.available ? '· ว่าง' : '· ไม่ว่าง') : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Input placeholder="ทะเบียนหางลาก" value={trailerPlate} onChange={e => setTrailerPlate(e.target.value)} />
              <Button size="sm" onClick={assign} disabled={busy}>{busy ? 'กำลังจัดรถ...' : 'จัดรถ'}</Button>
            </>
          )}
        </>
      ) : (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">รถร่วมใหม่ — ไม่มีโควตา ไม่มีค่าธรรมเนียมต่อคัน</p>
          <Input placeholder="ชื่อผู้รับจ้าง / บริษัท" value={newCarrierName} onChange={e => setNewCarrierName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="ทะเบียนหัวลาก" value={newCarrierPlate} onChange={e => setNewCarrierPlate(e.target.value)} />
            <Input placeholder="ทะเบียนหางลาก" value={newCarrierTrailerPlate} onChange={e => setNewCarrierTrailerPlate(e.target.value)} />
            <Input placeholder="เลขผู้เสียภาษี" value={newCarrierTaxId} onChange={e => setNewCarrierTaxId(e.target.value)} />
            <Input placeholder="เลขบัตรประชาชน" value={newCarrierNationalId} onChange={e => setNewCarrierNationalId(e.target.value)} />
            <Input placeholder="เบอร์โทร" value={newCarrierPhone} onChange={e => setNewCarrierPhone(e.target.value)} />
          </div>
          <Button size="sm" onClick={createSubcontractorAndAssign} disabled={busy || !newCarrierName.trim() || !newCarrierPlate.trim()}>
            {busy ? 'กำลังบันทึก...' : 'บันทึกและจัดรถ'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Advance + settlement (เงินทดรอง / เคลียร์บิล) ───────────────────────────
function AdvanceAndSettlement({ shipmentId, c, onDone }: { shipmentId: string; c: any; onDone: () => void }) {
  const [fuelEstimate, setFuelEstimate] = useState('');
  const [tollEstimate, setTollEstimate] = useState('');
  const [allowance, setAllowance] = useState('');
  const [busyAdvance, setBusyAdvance] = useState(false);

  const [distanceKm, setDistanceKm] = useState('');
  const [dieselPrice, setDieselPrice] = useState('32');
  const [fuelLiters, setFuelLiters] = useState('');
  const [tollActual, setTollActual] = useState('');
  const [busySettle, setBusySettle] = useState(false);
  const [error, setError] = useState('');

  const giveAdvance = async () => {
    setBusyAdvance(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/v1/shipments/${shipmentId}/driver-advance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: c.driver?.id,
          fuelEstimateCents: bahtToCents(fuelEstimate),
          tollEstimateCents: bahtToCents(tollEstimate),
          allowanceCents: allowance ? bahtToCents(allowance) : undefined,
          transferMethod: 'cash',
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await fetch(`${API_URL}/api/v1/shipments/${shipmentId}/driver-advance/transfer`, { method: 'POST' });
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setBusyAdvance(false); }
  };

  const clearBill = async () => {
    setBusySettle(true);
    setError('');
    try {
      if (fuelLiters && parseFloat(fuelLiters) > 0) {
        await fetch(`${API_URL}/api/v1/shipments/${shipmentId}/fuel-transactions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ liters: parseFloat(fuelLiters), pricePerLiterCents: bahtToCents(dieselPrice) }),
        });
      }
      const res = await fetch(`${API_URL}/api/v1/shipments/${shipmentId}/trip-settlement`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distanceKm: parseFloat(distanceKm) || 0,
          dieselPriceCentsPerLiter: bahtToCents(dieselPrice),
          actualTollCents: bahtToCents(tollActual),
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await fetch(`${API_URL}/api/v1/shipments/${shipmentId}/trip-settlement/settle`, { method: 'POST' });
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setBusySettle(false); }
  };

  if (!c.vehicle) return <p className="text-xs text-muted-foreground">จัดรถก่อนจึงจะเบิกเงินทดรองได้</p>;

  if (!c.advance) {
    return (
      <div className="space-y-2">
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="grid grid-cols-3 gap-2">
          <div><Label className="text-xs">ค่าน้ำมัน (โดยประมาณ)</Label><Input type="number" value={fuelEstimate} onChange={e => setFuelEstimate(e.target.value)} /></div>
          <div><Label className="text-xs">ค่าทางด่วน</Label><Input type="number" value={tollEstimate} onChange={e => setTollEstimate(e.target.value)} /></div>
          <div><Label className="text-xs">เบี้ยเลี้ยง</Label><Input type="number" value={allowance} onChange={e => setAllowance(e.target.value)} placeholder="มาตรฐาน" /></div>
        </div>
        <Button size="sm" onClick={giveAdvance} disabled={busyAdvance}>{busyAdvance ? 'กำลังเบิก...' : 'เบิกเงินทดรอง'}</Button>
      </div>
    );
  }

  if (c.netSettlementCents == null) {
    return (
      <div className="space-y-2">
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="text-xs text-muted-foreground">เงินทดรอง: {baht(c.advance.totalAdvanceCents)}</div>
        <div className="grid grid-cols-4 gap-2">
          <div><Label className="text-xs">ระยะทาง (กม.)</Label><Input type="number" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} /></div>
          <div><Label className="text-xs">ราคาน้ำมัน (บาท/ลิตร)</Label><Input type="number" step="0.01" value={dieselPrice} onChange={e => setDieselPrice(e.target.value)} /></div>
          <div><Label className="text-xs">น้ำมันจริง (ลิตร)</Label><Input type="number" value={fuelLiters} onChange={e => setFuelLiters(e.target.value)} /></div>
          <div><Label className="text-xs">ค่าทางด่วนจริง</Label><Input type="number" value={tollActual} onChange={e => setTollActual(e.target.value)} /></div>
        </div>
        <Button size="sm" onClick={clearBill} disabled={busySettle}>{busySettle ? 'กำลังเคลียร์บิล...' : 'เคลียร์บิล'}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">น้ำมันตามเกณฑ์:</span> {c.expectedLiters?.toFixed(1) ?? '—'} ล.
        <span className="text-muted-foreground ml-2">น้ำมันจริง:</span>
        <span className={c.isOverBenchmark ? 'text-destructive font-semibold' : ''}>{c.actualLiters?.toFixed(1) ?? '—'} ล.</span>
        {c.isOverBenchmark && <Badge variant="destructive" className="text-xs">เกินเกณฑ์</Badge>}
      </div>
      <div>
        {c.netSettlementCents >= 0 ? <span>คนขับคืนเงิน {baht(c.netSettlementCents)}</span> : <span>บริษัทจ่ายเพิ่ม {baht(Math.abs(c.netSettlementCents))}</span>}
      </div>
      <div className="text-muted-foreground">กำไรขั้นต้น: <span className={c.grossMarginCents < 0 ? 'text-destructive' : 'text-foreground'}>{baht(c.grossMarginCents)}</span></div>
    </div>
  );
}

// ─── One container row ───────────────────────────────────────────────────────
function ContainerCard({ c, onDone }: { c: any; onDone: () => void }) {
  const [printing, setPrinting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createShareLink = async () => {
    setSharing(true);
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`${API_URL}/api/v1/shipments/${c.shipmentId}/share-links`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: ['overview', 'events', 'documents'], expiresAt, label: 'ลิงก์ติดตามสำหรับลูกค้า' }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setShareUrl(json.data.url);
    } catch (e: any) { alert(e.message); }
    finally { setSharing(false); }
  };

  const markDelivered = async () => {
    setDelivering(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/shipments/${c.shipmentId}/mark-delivered`, { method: 'POST' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      onDone();
    } catch (e: any) { alert(e.message); }
    finally { setDelivering(false); }
  };

  const printJobSheet = async () => {
    setPrinting(true);
    try {
      // Opens print-styled HTML (correct Thai text shaping) rather than the
      // pdf-lib PDF, which misplaces Thai combining marks — see backend
      // route comment on /api/v1/documents/job-sheet-html.
      const res = await fetch(`${API_URL}/api/v1/documents/job-sheet-html/${c.shipmentId}`);
      if (!res.ok) throw new Error('สร้างใบปฏิบัติงานไม่สำเร็จ');
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e: any) { alert(e.message); }
    finally { setPrinting(false); }
  };

  const attachDocument = async (file: File) => {
    setUploading(true);
    try {
      // @fastify/multipart's req.file() only has fields that arrive BEFORE
      // the file part in the multipart body — append text fields first.
      const form = new FormData();
      form.append('entityType', 'shipment');
      form.append('entityId', c.shipmentId);
      form.append('description', 'ใบส่งของ / เอกสารกลับ');
      form.append('file', file);
      const res = await fetch(`${API_URL}/api/v1/attachments`, { method: 'POST', body: form });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      onDone();
    } catch (e: any) { alert(e.message); }
    finally { setUploading(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-mono">
          {c.container?.containerNumber || 'ยังไม่ทราบเลขตู้'} <span className="text-sm text-muted-foreground font-sans">({c.container?.sizeType})</span>
        </CardTitle>
        <div className="flex gap-2">
          {c.vehicle && (
            <Button size="sm" variant="outline" onClick={printJobSheet} disabled={printing}>
              <FileText className="h-4 w-4" /> {printing ? 'กำลังสร้าง...' : 'ใบปฏิบัติงาน'}
            </Button>
          )}
          {c.vehicle && c.status !== 'complete' && (
            <Button size="sm" onClick={markDelivered} disabled={delivering}>
              <CheckCircle2 className="h-4 w-4" /> {delivering ? 'กำลังบันทึก...' : 'ส่งถึงแล้ว'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <StatusStrip c={c} />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">จัดรถ</div>
            <DispatchSection shipmentId={c.shipmentId} c={c} onDone={onDone} />
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">เงินทดรอง / เคลียร์บิล</div>
            <AdvanceAndSettlement shipmentId={c.shipmentId} c={c} onDone={onDone} />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t">
          <input ref={fileInputRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && attachDocument(e.target.files[0])} />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            แนบเอกสารกลับ (ใบส่งของ)
          </Button>
          {c.attachmentCount > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="h-3 w-3" /> {c.attachmentCount} ไฟล์</span>
          )}
          <Button size="sm" variant="outline" onClick={createShareLink} disabled={sharing}>
            <Link2 className="h-4 w-4" /> {sharing ? 'กำลังสร้างลิงก์...' : 'ลิงก์ติดตามสำหรับลูกค้า'}
          </Button>
          {c.revenueCents > 0 && <span className="ml-auto text-xs text-muted-foreground">ค่าระวาง: {baht(c.revenueCents)}</span>}
        </div>
        {shareUrl && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs">
            <span className="truncate flex-1">{shareUrl}</span>
            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(shareUrl)}>คัดลอก</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function VNextJobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetch(`${API_URL}/api/v1/jobs/${id}`)
      .then(res => res.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setJob(json.data);
      })
      .catch(err => setError(err.message || 'โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (error || !job) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="h-5 w-5" /> {error || 'ไม่พบงาน'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate('/jobs')}>งานวันนี้</Button>
        <span className="text-muted-foreground">/ {job.orderNumber}</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight font-mono">{job.orderNumber}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{job.customer.name}</span>
          {job.bookingNumber && <span>· Booking: {job.bookingNumber}</span>}
          <span>· {job.origin?.city || job.origin?.name || '—'} → {job.destination?.city || job.destination?.name || '—'}</span>
        </div>
      </div>

      <div className="space-y-4">
        {job.containers.map((c: any) => (
          <ContainerCard key={c.shipmentId} c={c} onDone={load} />
        ))}
      </div>
    </div>
  );
}
