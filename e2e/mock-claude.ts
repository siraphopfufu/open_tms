/**
 * A scripted stand-in for the Claude Messages API, so the E2E stack exercises
 * the shipment assistant's real tool loop, tools and database without calling
 * a real model (no cost, no key, deterministic). Run with Node 22's built-in
 * TypeScript stripping: `node --experimental-strip-types mock-claude.ts`.
 *
 * Script: a question → one tool call (get_job when it names a container
 * number, otherwise search_jobs). The tool result → a Thai answer built from
 * the returned data, so a passing test proves real data flowed through.
 */
import { createServer } from 'node:http';

type Block = { type: string; text?: string; content?: string; tool_use_id?: string };
type Message = { role: string; content: string | Block[] };

const CONTAINER = /[A-Z]{4}\d{7}/;

function reply(res: import('node:http').ServerResponse, body: unknown) {
  res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_mock' });
  res.end(JSON.stringify(body));
}

function message(content: unknown[], stopReason: string) {
  return {
    id: `msg_mock_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: 'mock-claude',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function answerFrom(toolResult: string): string {
  const data = JSON.parse(toolResult);
  if (Array.isArray(data.jobs)) {
    if (data.count === 0) return 'ไม่พบงานที่ตรงกับคำถาม';
    return `พบ ${data.count} งาน: ${data.jobs.slice(0, 5).map((j: { orderNumber: string }) => j.orderNumber).join(', ')}`;
  }
  if (data.found === false) return 'ไม่พบตู้หรืองานนี้ในระบบ';
  if (data.job) return `งาน ${data.job.orderNumber} มี ${data.job.containers.length} ตู้`;
  return 'ได้ข้อมูลแล้ว';
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return reply(res, { ok: true });
  if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
    res.writeHead(404).end();
    return;
  }

  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    const body = JSON.parse(raw) as { messages: Message[]; tools?: { name: string }[] };
    const last = body.messages[body.messages.length - 1];

    // Anything that isn't the assistant (e.g. the triage agent) gets a harmless no-op.
    if (!body.tools?.some(t => t.name === 'search_jobs')) {
      return reply(res, message([{ type: 'text', text: '{"actionType":"no_action","summary":"mock","reasoning":"mock","confidence":0}' }], 'end_turn'));
    }

    const toolResult = Array.isArray(last.content) ? last.content.find(b => b.type === 'tool_result') : undefined;
    if (toolResult?.content) {
      return reply(res, message([{ type: 'text', text: answerFrom(toolResult.content) }], 'end_turn'));
    }

    const question = typeof last.content === 'string' ? last.content : (last.content.find(b => b.type === 'text')?.text ?? '');
    const container = question.match(CONTAINER)?.[0];
    const toolUse = container
      ? { type: 'tool_use', id: 'toolu_mock_1', name: 'get_job', input: { container_number: container } }
      : { type: 'tool_use', id: 'toolu_mock_1', name: 'search_jobs', input: { limit: 5 } };
    return reply(res, message([toolUse], 'tool_use'));
  });
}).listen(8080, () => console.log('mock-claude listening on :8080'));
