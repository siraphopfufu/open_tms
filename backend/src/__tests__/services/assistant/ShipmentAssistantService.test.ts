import { ShipmentAssistantService } from '../../../services/assistant/ShipmentAssistantService';
import { CREATE_AGENT_DECISION } from '../../../commands/agentDecisions/CreateAgentDecisionCommand';

const ORG = 'org-1';
const usage = { input_tokens: 100, output_tokens: 20 };

const toolUse = (id: string, name: string, input: unknown) => ({
  stop_reason: 'tool_use',
  usage,
  content: [
    { type: 'thinking', thinking: '', signature: 'sig' },
    { type: 'tool_use', id, name, input },
  ],
});
const final = (text: string) => ({ stop_reason: 'end_turn', usage, content: [{ type: 'text', text }] });

function setup(responses: any[]) {
  const create = jest.fn();
  for (const r of responses) create.mockResolvedValueOnce(r);
  const tools = {
    execute: jest.fn().mockResolvedValue({ result: { found: true }, isError: false, jobRefs: [{ jobId: 'job-1', orderNumber: 'ORD-001' }] }),
  };
  const commandBus = { dispatch: jest.fn().mockResolvedValue({ success: true, data: { id: 'dec-1' }, events: [] }) };
  const service = new ShipmentAssistantService(
    { client: { messages: { create } } as any, provider: 'bedrock', model: 'anthropic.claude-opus-5' },
    tools as any,
    commandBus as any,
    () => new Date('2026-09-26T01:00:00Z'),
  );
  return { create, tools, commandBus, service };
}

describe('ShipmentAssistantService', () => {
  it('runs tools with the caller’s org and returns the final answer with job links', async () => {
    const { create, tools, service } = setup([toolUse('tu-1', 'get_job', { container_number: 'MSKU1234565' }), final('ตู้ MSKU1234565 ส่งถึงแล้ว')]);

    const reply = await service.chat(ORG, 'user-1', [{ role: 'user', content: 'ตู้ MSKU1234565 อยู่ไหน' }]);

    expect(reply.answer).toBe('ตู้ MSKU1234565 ส่งถึงแล้ว');
    expect(reply.jobRefs).toEqual([{ jobId: 'job-1', orderNumber: 'ORD-001' }]);
    expect(reply.toolCalls).toEqual([{ name: 'get_job', input: { container_number: 'MSKU1234565' }, isError: false }]);
    expect(tools.execute).toHaveBeenCalledWith(ORG, 'get_job', { container_number: 'MSKU1234565' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('sends the assistant turn back unchanged (thinking included) and all tool results in one user message', async () => {
    const both = {
      stop_reason: 'tool_use',
      usage,
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'tool_use', id: 'a', name: 'search_jobs', input: {} },
        { type: 'tool_use', id: 'b', name: 'list_unsettled_advances', input: {} },
      ],
    };
    const { create, service } = setup([both, final('done')]);

    await service.chat(ORG, 'user-1', [{ role: 'user', content: 'สรุปงาน' }]);

    const second = create.mock.calls[1][0];
    expect(second.messages[1]).toEqual({ role: 'assistant', content: both.content });
    expect(second.messages[2].role).toBe('user');
    expect(second.messages[2].content.map((b: any) => b.tool_use_id)).toEqual(['a', 'b']);
  });

  it('asks the model with the system prompt cached, tools attached, and today’s Bangkok date', async () => {
    const { create, service } = setup([final('ok')]);
    await service.chat(ORG, 'user-1', [{ role: 'user', content: 'hi' }]);

    const req = create.mock.calls[0][0];
    expect(req.model).toBe('anthropic.claude-opus-5');
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.system[1].text).toContain('2026-09-26');
    expect(req.tools.map((t: any) => t.name)).toContain('get_job');
  });

  it('turns a tool that throws into an error result instead of failing the chat', async () => {
    const { tools, create, service } = setup([toolUse('tu-1', 'search_jobs', {}), final('ขออภัย')]);
    tools.execute.mockRejectedValueOnce(new Error('db down'));

    const reply = await service.chat(ORG, 'user-1', [{ role: 'user', content: 'x' }]);

    expect(reply.toolCalls[0].isError).toBe(true);
    const result = create.mock.calls[1][0].messages[2].content[0];
    expect(result).toMatchObject({ is_error: true });
    expect(result.content).not.toContain('db down');
  });

  it('stops after a bounded number of model calls', async () => {
    const looping = Array.from({ length: 10 }, (_, i) => toolUse(`tu-${i}`, 'search_jobs', {}));
    const { create, service } = setup(looping);

    const reply = await service.chat(ORG, 'user-1', [{ role: 'user', content: 'x' }]);

    expect(create).toHaveBeenCalledTimes(6);
    expect(reply.answer).toMatch(/ขออภัย/);
  });

  it('handles a refusal without exposing internals', async () => {
    const { service } = setup([{ stop_reason: 'refusal', usage, content: [] }]);
    const reply = await service.chat(ORG, 'user-1', [{ role: 'user', content: 'x' }]);
    expect(reply.answer).toBe('ขออภัย ไม่สามารถตอบคำถามนี้ได้');
  });

  it('logs every answered question as an agent decision in the caller’s org', async () => {
    const { commandBus, service } = setup([toolUse('tu-1', 'get_job', { order_number: 'ORD-001' }), final('answer')]);

    const reply = await service.chat(ORG, 'user-1', [{ role: 'user', content: 'งาน ORD-001 เป็นยังไง' }]);

    expect(reply.decisionId).toBe('dec-1');
    const cmd = commandBus.dispatch.mock.calls[0][0];
    expect(cmd).toMatchObject({
      type: CREATE_AGENT_DECISION,
      orgId: ORG,
      actorId: 'user-1',
      payload: {
        agentType: 'shipment_assistant',
        modelProvider: 'bedrock',
        modelId: 'anthropic.claude-opus-5',
        actionType: 'answer_question',
        summary: 'งาน ORD-001 เป็นยังไง',
        reasoning: 'answer',
        inputTokens: 200,
        outputTokens: 40,
      },
    });
  });
});
