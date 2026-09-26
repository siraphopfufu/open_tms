import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Loader2, Send, Sparkles } from 'lucide-react';
import { API_URL } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import VNextAgentDecisions from './VNextAgentDecisions';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  jobRefs?: { jobId: string; orderNumber: string }[];
  toolCalls?: { name: string }[];
  failed?: boolean;
}

interface AssistantStatus {
  enabled: boolean;
  model: string | null;
}

const SUGGESTIONS = [
  'วันนี้มีงานอะไรบ้าง ตู้ไหนยังไม่ได้จัดรถ',
  'งานไหนพร้อมวางบิลแต่ยังไม่วาง',
  'คนขับคนไหนเบิกเงินทดรองแล้วยังไม่เคลียร์บิล',
  'ยอดค่าระวางเดือนนี้แยกตามลูกค้า',
];

const TOOL_LABELS: Record<string, string> = {
  search_jobs: 'ค้นหางาน',
  get_job: 'รายละเอียดงาน',
  list_ready_to_invoice: 'งานพร้อมวางบิล',
  list_unsettled_advances: 'เงินทดรองค้าง',
  revenue_summary: 'สรุปค่าระวาง',
};

function AssistantChat() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/assistant/status`)
      .then(r => r.json())
      .then(json => setStatus(json.data ?? { enabled: false, model: null }))
      .catch(() => setStatus({ enabled: false, model: null }));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || sending) return;
    const history: ChatMessage[] = [...messages.filter(m => !m.failed), { role: 'user', content: text }];
    setMessages([...messages, { role: 'user', content: text }]);
    setDraft('');
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Only the visible text goes back; the server re-runs any lookups it needs.
        body: JSON.stringify({ messages: history.slice(-20).map(m => ({ role: m.role, content: m.content })) }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'ผู้ช่วยตอบไม่ได้ในตอนนี้');
      setMessages(prev => [...prev, { role: 'assistant', content: json.data.answer, jobRefs: json.data.jobRefs, toolCalls: json.data.toolCalls }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: e.message || 'ผู้ช่วยตอบไม่ได้ในตอนนี้', failed: true }]);
    } finally {
      setSending(false);
    }
  };

  if (status && !status.enabled) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-6 text-sm text-muted-foreground">
          <Bot className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-medium text-foreground">ยังไม่ได้เปิดใช้ผู้ช่วย AI</div>
            ผู้ดูแลระบบต้องตั้งค่าการเชื่อมต่อโมเดล AI ก่อน จึงจะถามคำถามเกี่ยวกับงานได้
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-[calc(100vh-14rem)] min-h-[28rem] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3 py-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-primary" />
            <p className="text-sm text-muted-foreground">ถามเรื่องงาน ตู้ คนขับ เงินทดรอง หรือการวางบิลได้เลย</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map(s => (
                <Button key={s} variant="outline" size="sm" onClick={() => ask(s)} disabled={sending || !status}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              data-role={m.role}
              className={cn(
                'max-w-[80%] rounded-lg px-4 py-2 text-sm',
                m.role === 'user' && 'bg-primary text-primary-foreground',
                m.role === 'assistant' && !m.failed && 'bg-muted text-foreground',
                m.failed && 'border border-destructive/30 bg-destructive/10 text-destructive',
              )}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {!!m.jobRefs?.length && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.jobRefs.map(ref => (
                    <Link key={ref.jobId} to={`/jobs/${ref.jobId}`}>
                      <Badge variant="outline" className="font-mono text-xs hover:bg-accent">{ref.orderNumber}</Badge>
                    </Link>
                  ))}
                </div>
              )}
              {!!m.toolCalls?.length && (
                <div className="mt-1.5 text-xs text-muted-foreground">
                  ข้อมูลจาก: {[...new Set(m.toolCalls.map(t => TOOL_LABELS[t.name] ?? t.name))].join(', ')}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังค้นหาข้อมูล...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 border-t p-3"
        onSubmit={e => { e.preventDefault(); ask(draft); }}
      >
        <Input
          aria-label="ถามผู้ช่วย AI"
          placeholder="เช่น ตู้ MSKU1234565 อยู่ไหนแล้ว"
          value={draft}
          maxLength={2000}
          onChange={e => setDraft(e.target.value)}
          disabled={sending || !status}
        />
        <Button type="submit" disabled={sending || !draft.trim() || !status}>
          <Send className="h-4 w-4" /> ถาม
        </Button>
      </form>
      {status?.model && <div className="px-3 pb-2 text-right text-xs text-muted-foreground">{status.model}</div>}
    </Card>
  );
}

export default function VNextAssistant() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ผู้ช่วย AI</h1>
        <p className="text-sm text-muted-foreground">ถามข้อมูลงานและตู้ของคุณเป็นภาษาปกติ ผู้ช่วยอ่านข้อมูลได้อย่างเดียว ไม่แก้ไขอะไรในระบบ</p>
      </div>
      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat">ถามผู้ช่วย</TabsTrigger>
          <TabsTrigger value="history">ประวัติการตัดสินใจ</TabsTrigger>
        </TabsList>
        <TabsContent value="chat"><AssistantChat /></TabsContent>
        <TabsContent value="history"><VNextAgentDecisions /></TabsContent>
      </Tabs>
    </div>
  );
}
