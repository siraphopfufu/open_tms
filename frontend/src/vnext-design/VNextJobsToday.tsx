import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, RefreshCw } from 'lucide-react';

import { API_URL } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_LABEL: Record<string, string> = {
  pending: 'รอดำเนินการ',
  verified: 'เปิดงานแล้ว',
  assigned: 'จัดรถแล้ว',
  issue: 'มีปัญหา',
  archived: 'เก็บถาวร',
};

function formatThaiDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function VNextJobsToday() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetch(`${API_URL}/api/v1/jobs`)
      .then(res => res.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setJobs(json.data);
      })
      .catch(err => setError(err.message || 'โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">งานวันนี้</h1>
          <p className="mt-1 text-sm text-muted-foreground">{jobs ? `${jobs.length} งาน` : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={() => navigate('/jobs/new')}>
            <Plus className="h-4 w-4" /> เปิดงานใหม่
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {loading && !jobs ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : jobs && jobs.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">ยังไม่มีงาน — กด "เปิดงานใหม่" เพื่อเริ่ม</CardContent></Card>
      ) : jobs ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่งาน</TableHead>
                  <TableHead>ลูกค้า</TableHead>
                  <TableHead>เส้นทาง</TableHead>
                  <TableHead>ตู้</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>วันที่เปิดงาน</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(j => (
                  <TableRow key={j.id} className="cursor-pointer" onClick={() => navigate(`/jobs/${j.id}`)}>
                    <TableCell className="font-mono font-medium">{j.orderNumber}</TableCell>
                    <TableCell>{j.customerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {j.originName || '—'} → {j.destinationName || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{j.containerCount} ตู้</Badge>
                    </TableCell>
                    <TableCell><Badge variant="outline">{STATUS_LABEL[j.status] || j.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatThaiDate(j.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
