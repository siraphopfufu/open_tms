import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CircleAlert,
  CreditCard,
  Download,
  FileText,
  Loader2,
  Send,
} from 'lucide-react';

import { API_URL } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface InvoiceLineItem {
  id: string;
  chargeType: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  shipmentId?: string;
  freightClass?: string;
  containerNumber?: string;
}

interface Payment {
  id: string;
  amountCents: number;
  paymentMethod?: string;
  referenceNumber?: string;
  receivedDate: string;
  notes?: string;
}

interface WithholdingCertificate {
  id: string;
  certificateNumber: string;
  withholdingType: string;
  witheldAmountCents: number;
  issueDate: string;
}

interface ReceiptData {
  id: string;
  receiptNumber: string;
  amountCents: number;
  issueDate: string;
}

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  status: string;
  customer: { id: string; name: string; billingEmail?: string; contactEmail?: string };
  subtotalCents: number;
  taxCents: number;
  vatCents: number;
  whtCents: number;
  netPayableCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  currency: string;
  paymentTermsDays: number;
  issueDate: string;
  dueDate: string;
  sentAt?: string;
  paidAt?: string;
  notes?: string;
  internalNotes?: string;
  lineItems: InvoiceLineItem[];
  payments: Payment[];
  withholdingCertificate?: WithholdingCertificate | null;
  receipt?: ReceiptData | null;
}

function formatMoney(cents: number, currency = 'USD'): string {
  const symbol = currency === 'THB' ? '฿' : '$';
  return `${symbol}${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(d?: string): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'muted';

function statusVariant(s: string): BadgeVariant {
  const m: Record<string, BadgeVariant> = {
    draft: 'secondary',
    approved: 'info',
    sent: 'default',
    partial_paid: 'warning',
    paid: 'success',
    overdue: 'destructive',
    void: 'secondary',
    disputed: 'destructive',
  };
  return m[s] || 'secondary';
}

export default function VNextFinanceInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('ach');
  const [paymentRef, setPaymentRef] = useState('');
  const [showPayment, setShowPayment] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/v1/invoices/${id}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setInvoice(json.data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const doAction = async (action: string, body?: any) => {
    setActionLoading(action);
    try {
      const res = await fetch(`${API_URL}/api/v1/invoices/${id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : '{}',
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(''); }
  };

  const recordPayment = async () => {
    const cents = Math.round(parseFloat(paymentAmount) * 100);
    if (!cents || cents <= 0) { alert('Enter a valid amount'); return; }
    await doAction('payments', { amountCents: cents, paymentMethod, referenceNumber: paymentRef || undefined });
    setShowPayment(false);
    setPaymentAmount('');
    setPaymentRef('');
  };

  const downloadDocument = async (endpoint: string, actionKey: string) => {
    setActionLoading(actionKey);
    try {
      const genRes = await fetch(`${API_URL}/api/v1/documents/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id }),
      });
      const genJson = await genRes.json();
      if (genJson.error) throw new Error(genJson.error);
      const dlRes = await fetch(`${API_URL}/api/v1/documents/${genJson.data.id}/download`);
      const blob = await dlRes.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = genJson.data.fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(''); }
  };

  const issueCertificate = async () => {
    setActionLoading('certificate');
    try {
      const res = await fetch(`${API_URL}/api/v1/invoices/${id}/withholding-certificate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(''); }
  };

  const issueReceipt = async () => {
    setActionLoading('receipt');
    try {
      const res = await fetch(`${API_URL}/api/v1/invoices/${id}/receipt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(''); }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <h3 className="text-lg font-medium">Loading...</h3>
      </div>
    );
  }
  if (error || !invoice) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <CircleAlert className="h-5 w-5" />
        {error || 'Invoice not found'}
      </div>
    );
  }

  const i = invoice;
  const isPastDue = new Date(i.dueDate) < new Date() && !['paid', 'void'].includes(i.status);
  const isThai = i.currency === 'THB';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate('/finance/invoices')}>
          <ArrowLeft className="h-4 w-4" /> Invoices
        </Button>
        <span className="text-muted-foreground">/ {i.invoiceNumber}</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{i.invoiceNumber}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={statusVariant(i.status)}>{i.status.replace(/_/g, ' ')}</Badge>
            {isPastDue && <Badge variant="destructive">OVERDUE</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadDocument('invoice-pdf', 'invoice-pdf')} disabled={!!actionLoading}>
            <Download className="h-4 w-4" />
            {actionLoading === 'invoice-pdf' ? 'Preparing...' : 'Download PDF'}
          </Button>
          {i.status === 'draft' && (
            <Button size="sm" onClick={() => doAction('approve')} disabled={!!actionLoading}>
              {actionLoading === 'approve' ? 'Approving...' : 'Approve'}
            </Button>
          )}
          {['draft', 'approved'].includes(i.status) && (
            <Button size="sm" onClick={() => doAction('send')} disabled={!!actionLoading}>
              <Send className="h-4 w-4" />
              {actionLoading === 'send' ? 'Sending...' : 'Send'}
            </Button>
          )}
          {['sent', 'partial_paid', 'overdue'].includes(i.status) && (
            <Button size="sm" variant="default" onClick={() => setShowPayment(!showPayment)}>
              <CreditCard className="h-4 w-4" /> Record Payment
            </Button>
          )}
          {i.paidCents === 0 && !['void', 'paid'].includes(i.status) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { if (confirm('Void this invoice?')) doAction('void', { reason: 'Voided by user' }); }}
              disabled={!!actionLoading}
            >
              Void
            </Button>
          )}
        </div>
      </div>

      {showPayment && (
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-4 text-base font-semibold">Record Payment</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="payment-amount">Amount ({isThai ? '฿' : '$'})</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={i.balanceCents / 100}
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  placeholder={`Max ${(i.balanceCents / 100).toFixed(2)}`}
                  className="w-[180px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ach">ACH</SelectItem>
                    <SelectItem value="wire">Wire</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-ref">Reference #</Label>
                <Input
                  id="payment-ref"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  placeholder="Check #, ACH ref..."
                  className="w-[200px]"
                />
              </div>
              <Button onClick={recordPayment} disabled={!!actionLoading}>
                {actionLoading === 'payments' ? 'Recording...' : 'Record'}
              </Button>
              <Button variant="ghost" onClick={() => setShowPayment(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between p-5">
              <h2 className="text-lg font-semibold">Line Items</h2>
            </div>
            <Separator />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  {isThai && <TableHead>Container</TableHead>}
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {i.lineItems.map(li => (
                  <TableRow key={li.id}>
                    <TableCell>
                      {li.description}
                      {li.freightClass && <span className="ml-1 text-sm text-muted-foreground">(Class {li.freightClass})</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{li.chargeType.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    {isThai && <TableCell className="font-mono text-sm">{li.containerNumber || '-'}</TableCell>}
                    <TableCell className="text-right font-mono tabular-nums">{li.quantity}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(li.unitPriceCents, i.currency)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-medium">{formatMoney(li.totalCents, i.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t p-5">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-semibold">Subtotal</span>
                  <span className="font-mono tabular-nums font-semibold">{formatMoney(i.subtotalCents, i.currency)}</span>
                </div>
                {isThai ? (
                  <>
                    <div className="flex justify-between">
                      <span>VAT (7%)</span>
                      <span className="font-mono tabular-nums">{formatMoney(i.vatCents, i.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Withholding Tax (1%, deducted by payer)</span>
                      <span className="font-mono tabular-nums">-{formatMoney(i.whtCents, i.currency)}</span>
                    </div>
                    <div className="flex justify-between text-base">
                      <span className="font-bold">Net Payable</span>
                      <span className="font-mono tabular-nums font-bold">{formatMoney(i.netPayableCents, i.currency)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    {i.taxCents > 0 && (
                      <div className="flex justify-between">
                        <span>Tax</span>
                        <span className="font-mono tabular-nums">{formatMoney(i.taxCents, i.currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base">
                      <span className="font-bold">Total</span>
                      <span className="font-mono tabular-nums font-bold">{formatMoney(i.totalCents, i.currency)}</span>
                    </div>
                  </>
                )}
                {i.paidCents > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Paid</span>
                    <span className="font-mono tabular-nums">-{formatMoney(i.paidCents, i.currency)}</span>
                  </div>
                )}
                <div className={cn('flex justify-between font-bold', i.balanceCents > 0 ? 'text-destructive' : 'text-success')}>
                  <span>Balance Due</span>
                  <span className="font-mono tabular-nums">{formatMoney(i.balanceCents, i.currency)}</span>
                </div>
              </div>
            </div>
          </Card>

          {isThai && (
            <Card>
              <div className="flex items-center justify-between p-5">
                <h2 className="text-lg font-semibold">Withholding Tax Certificate (50 ทวิ)</h2>
                {!i.withholdingCertificate && i.whtCents > 0 && (
                  <Button size="sm" onClick={issueCertificate} disabled={!!actionLoading}>
                    <FileText className="h-4 w-4" />
                    {actionLoading === 'certificate' ? 'Issuing...' : 'Issue Certificate'}
                  </Button>
                )}
              </div>
              <Separator />
              <div className="p-5">
                {i.withholdingCertificate ? (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <dl className="grid grid-cols-3 gap-6 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Certificate #</dt>
                        <dd className="font-mono">{i.withholdingCertificate.certificateNumber}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Form</dt>
                        <dd>{i.withholdingCertificate.withholdingType === 'pnd3' ? 'ภ.ง.ด. 3' : 'ภ.ง.ด. 53'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Withheld Amount</dt>
                        <dd className="font-mono tabular-nums">{formatMoney(i.withholdingCertificate.witheldAmountCents, i.currency)}</dd>
                      </div>
                    </dl>
                    <Button size="sm" variant="outline" onClick={() => downloadDocument('withholding-certificate-pdf', 'wht-pdf')} disabled={!!actionLoading}>
                      <Download className="h-4 w-4" />
                      {actionLoading === 'wht-pdf' ? 'Preparing...' : 'Download PDF'}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {i.whtCents > 0
                      ? 'No certificate issued yet — issue one once the customer confirms the withheld amount.'
                      : 'This invoice has no withholding tax to certify.'}
                  </p>
                )}
              </div>
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between p-5">
              <h2 className="text-lg font-semibold">Official Receipt</h2>
              {!i.receipt && i.paidCents > 0 && (
                <Button size="sm" onClick={issueReceipt} disabled={!!actionLoading}>
                  <FileText className="h-4 w-4" />
                  {actionLoading === 'receipt' ? 'Issuing...' : 'Issue Receipt'}
                </Button>
              )}
            </div>
            <Separator />
            <div className="p-5">
              {i.receipt ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <dl className="grid grid-cols-3 gap-6 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Receipt #</dt>
                      <dd className="font-mono">{i.receipt.receiptNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Issued</dt>
                      <dd>{formatDate(i.receipt.issueDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Amount</dt>
                      <dd className="font-mono tabular-nums">{formatMoney(i.receipt.amountCents, i.currency)}</dd>
                    </div>
                  </dl>
                  <Button size="sm" variant="outline" onClick={() => downloadDocument('receipt-pdf', 'receipt-pdf')} disabled={!!actionLoading}>
                    <Download className="h-4 w-4" />
                    {actionLoading === 'receipt-pdf' ? 'Preparing...' : 'Download PDF'}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {i.paidCents > 0
                    ? 'No receipt issued yet — issue one once payment has cleared.'
                    : 'Record a payment before issuing a receipt.'}
                </p>
              )}
            </div>
          </Card>

          {i.payments.length > 0 && (
            <Card>
              <div className="p-5">
                <h2 className="text-lg font-semibold">Payment History</h2>
              </div>
              <Separator />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {i.payments.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.receivedDate)}</TableCell>
                      <TableCell>{p.paymentMethod ?? '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.referenceNumber ?? '-'}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-medium text-success">{formatMoney(p.amountCents, i.currency)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.notes ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-4 text-base font-semibold">Invoice Details</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Customer</dt>
                  <dd>{i.customer.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Issue Date</dt>
                  <dd>{formatDate(i.issueDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Due Date</dt>
                  <dd className={cn(isPastDue && 'text-destructive')}>{formatDate(i.dueDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Payment Terms</dt>
                  <dd>Net {i.paymentTermsDays}</dd>
                </div>
                {i.sentAt && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Sent</dt>
                    <dd>{formatDate(i.sentAt)}</dd>
                  </div>
                )}
                {i.paidAt && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Paid</dt>
                    <dd>{formatDate(i.paidAt)}</dd>
                  </div>
                )}
                {i.notes && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Notes</dt>
                    <dd>{i.notes}</dd>
                  </div>
                )}
                {i.internalNotes && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Internal Notes</dt>
                    <dd className="italic">{i.internalNotes}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
