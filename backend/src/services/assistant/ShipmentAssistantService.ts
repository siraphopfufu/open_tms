/**
 * ผู้ช่วย AI: answers dispatcher questions about the org's jobs by letting
 * Claude call read-only tools (see assistantTools.ts). Stateless: the client
 * sends the visible text history each time; tool calls are re-run per turn.
 *
 * Every answered question is logged as an AgentDecision (agentType
 * `shipment_assistant`) through the command bus, like every other agent
 * decision, so it shows up in the decision history for review.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ICommandBus } from '../../commands/CommandBus.js';
import { randomUUID } from 'crypto';
import { CREATE_AGENT_DECISION, type CreateAgentDecisionPayload } from '../../commands/agentDecisions/CreateAgentDecisionCommand.js';
import type { AssistantModel } from './assistantModel.js';
import { ASSISTANT_TOOLS, type AssistantToolExecutor } from './assistantTools.js';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  answer: string;
  jobRefs: { jobId: string; orderNumber: string }[];
  toolCalls: { name: string; input: unknown; isError: boolean }[];
  decisionId: string | null;
}

/** Bound on model round trips per question, so a confused loop can't run up cost. */
const MAX_MODEL_CALLS = 6;

const SYSTEM_PROMPT = `You are ผู้ช่วย AI, the assistant inside Ather TMS for a Thai container-drayage company. Dispatchers, billing staff and managers ask you about their jobs (งาน), containers (ตู้/เที่ยว), trucks, drivers, driver advances (เงินทดรอง), trip settlement (เคลียร์บิล), delivery documents (ใบส่งของ/POD) and billing (วางบิล).

Answer only from what the tools return. Call tools to look things up; never guess a status, amount, plate, name or date. When you need several lookups that don't depend on each other, request them together in one turn rather than one at a time. If the tools return nothing relevant, say so plainly and suggest what the user could search for instead. You can only read data: if asked to change something (dispatch a truck, create an invoice, settle a trip), explain where in the app to do it.

Reply in the language the user wrote in (usually Thai). Keep answers short and scannable: lead with the direct answer, then a compact list when there are several items. Amounts from tools are already in baht; format them like ฿18,000.00. Mention the order number or container number for each job you refer to so the user can open it.`;

export class ShipmentAssistantService {
  constructor(
    private model: AssistantModel,
    private tools: AssistantToolExecutor,
    private commandBus: ICommandBus,
    private now: () => Date = () => new Date(),
  ) {}

  get modelId() {
    return this.model.model;
  }

  async chat(orgId: string, actorId: string, history: ChatTurn[]): Promise<AssistantReply> {
    const started = Date.now();
    const today = this.now().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const messages: Anthropic.MessageParam[] = history.map(t => ({ role: t.role, content: t.content }));
    const toolCalls: AssistantReply['toolCalls'] = [];
    const jobRefs = new Map<string, string>();
    let inputTokens = 0;
    let outputTokens = 0;
    let answer = '';

    for (let call = 0; call < MAX_MODEL_CALLS; call++) {
      const response = await this.model.client.messages.create({
        model: this.model.model,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        output_config: { effort: this.model.effort },
        system: [
          // Explicit breakpoint: the stable prompt + tool list cache across questions.
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `Today is ${today} (Asia/Bangkok).` },
        ],
        tools: ASSISTANT_TOOLS,
        messages,
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      if (response.stop_reason === 'refusal') {
        answer = 'ขออภัย ไม่สามารถตอบคำถามนี้ได้';
        break;
      }

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        answer = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim();
        break;
      }

      messages.push({ role: 'assistant', content: response.content });
      // Tools are independent reads, so run one turn's calls concurrently.
      const outcomes = await Promise.all(toolUses.map(use =>
        this.tools.execute(orgId, use.name, use.input).catch(() => ({
          result: { error: 'Lookup failed' },
          isError: true,
          jobRefs: [] as { jobId: string; orderNumber: string }[],
        })),
      ));
      const results: Anthropic.ToolResultBlockParam[] = toolUses.map((use, i) => {
        const outcome = outcomes[i];
        toolCalls.push({ name: use.name, input: use.input, isError: outcome.isError });
        for (const ref of outcome.jobRefs) jobRefs.set(ref.jobId, ref.orderNumber);
        return {
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(outcome.result),
          ...(outcome.isError && { is_error: true }),
        };
      });
      // All results for one assistant turn go back in a single user message.
      messages.push({ role: 'user', content: results });
    }

    if (!answer) answer = 'ขออภัย ค้นหาข้อมูลไม่เสร็จ ลองถามให้เจาะจงขึ้นอีกนิด';

    const question = [...history].reverse().find(t => t.role === 'user')?.content ?? '';
    const decisionId = await this.logDecision(orgId, actorId, {
      question,
      answer,
      toolCalls,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - started,
    });

    return {
      answer,
      jobRefs: [...jobRefs].map(([jobId, orderNumber]) => ({ jobId, orderNumber })),
      toolCalls,
      decisionId,
    };
  }

  private async logDecision(
    orgId: string,
    actorId: string,
    d: { question: string; answer: string; toolCalls: AssistantReply['toolCalls']; inputTokens: number; outputTokens: number; durationMs: number },
  ): Promise<string | null> {
    const result = await this.commandBus.dispatch<CreateAgentDecisionPayload, { id: string }>({
      type: CREATE_AGENT_DECISION,
      orgId,
      actorId,
      payload: {
        agentType: 'shipment_assistant',
        modelProvider: this.model.provider,
        modelId: this.model.model,
        triggerType: 'manual',
        summary: d.question.slice(0, 240),
        reasoning: d.answer,
        context: { toolCalls: d.toolCalls },
        conversationLog: [
          { role: 'user', content: d.question },
          { role: 'assistant', content: d.answer },
        ],
        actionType: 'answer_question',
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
        durationMs: d.durationMs,
      },
      metadata: { correlationId: randomUUID(), source: 'api' },
    }).catch(() => null);
    return result?.success ? (result.data as { id: string }).id : null;
  }
}
