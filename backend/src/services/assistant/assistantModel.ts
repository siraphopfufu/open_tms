/**
 * Which Claude endpoint the shipment assistant talks to.
 *
 * - ASSISTANT_PROVIDER=bedrock: Claude in Amazon Bedrock (the Messages-API
 *   "Mantle" endpoint). Authenticates with the AWS credential chain, i.e. the
 *   ECS task role in production, so there is no API key to store or rotate.
 * - ASSISTANT_PROVIDER=anthropic: the Claude API with ANTHROPIC_API_KEY
 *   (ANTHROPIC_BASE_URL optionally points it at a mock in E2E).
 * - unset: the assistant is off and its endpoint says so.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';

export type AssistantEffort = 'low' | 'medium' | 'high';

export interface AssistantModel {
  client: { messages: Anthropic['messages'] };
  provider: 'bedrock' | 'anthropic';
  model: string;
  /** ASSISTANT_EFFORT; lookups-and-summarise chat rarely needs more than low. */
  effort: AssistantEffort;
}

function effortFrom(env: NodeJS.ProcessEnv): AssistantEffort {
  const e = env.ASSISTANT_EFFORT;
  return e === 'medium' || e === 'high' ? e : 'low';
}

export function createAssistantModel(env: NodeJS.ProcessEnv = process.env): AssistantModel | null {
  const provider = env.ASSISTANT_PROVIDER;

  if (provider === 'bedrock') {
    return {
      client: new AnthropicBedrockMantle({ awsRegion: env.ASSISTANT_AWS_REGION || env.AWS_REGION }),
      provider,
      model: env.ASSISTANT_MODEL || 'anthropic.claude-opus-5',
      effort: effortFrom(env),
    };
  }

  if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
    return {
      client: new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        ...(env.ANTHROPIC_BASE_URL && { baseURL: env.ANTHROPIC_BASE_URL }),
      }),
      provider,
      model: env.ASSISTANT_MODEL || 'claude-opus-5',
      effort: effortFrom(env),
    };
  }

  return null;
}
