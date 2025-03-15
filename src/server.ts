import {
  type AgentNamespace,
  routeAgentRequest,
  type Schedule,
} from "agents-sdk";
import { AIChatAgent } from "agents-sdk/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId, generateObject, generateText,
  streamText,
  type StreamTextOnFinishCallback,
} from "ai";
import { processToolCalls } from "./utils";
import { executions, tools } from "./tools";
import { AsyncLocalStorage } from "node:async_hooks";
import { createOpenRouter, type OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import type { Message } from "@ai-sdk/ui-utils";
import { z } from "zod";

const GEMINI_MODEL = "google/gemini-2.0-flash-001";

export type Env = {
  OPENROUTER_API_KEY: string;
  Chat: AgentNamespace<Chat>;
};

export const agentContext = new AsyncLocalStorage<Chat>();

export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */
  async onChatMessage(
    // biome-ignore lint/complexity/noBannedTypes:
    onFinish: StreamTextOnFinishCallback<{}>
  ) {
    return agentContext.run(this, async () => {
      return createDataStreamResponse({
        execute: async (dataStream) => {
          // Handle tool calls
          const processedMessages = await processToolCalls({
            messages: this.messages,
            dataStream,
            tools,
            executions,
          });

          const openrouter = createOpenRouter({
            apiKey: this.env.OPENROUTER_API_KEY,
          });

          try {
            const agentsInvolved = await this.agentRouter(openrouter, processedMessages);
            console.log(`Agents involved: ${agentsInvolved}`);

            let agentResponse = "";

            for (const agent of agentsInvolved) {
              let promise: Promise<string>;
              switch (agent) {
                case "schedule":
                  promise = this.scheduleAgent(openrouter, processedMessages);
                  break;
                case "finance":
                  promise = this.financeAgent(openrouter, processedMessages);
                  break;
                case "health":
                  promise = this.healthAgent(openrouter, processedMessages);
                  break;
                case "knowledge":
                  promise = this.knowledgeAgent(openrouter, processedMessages);
                  break;
                default:
                  throw new Error(`Unknown agent ${agent}`);
              }

              agentResponse += `${agent} agent response: ${await promise}\n`;
              processedMessages.push({
                id: generateId(),
                role: "assistant",
                content: agentResponse,
              });
            }

            console.log(agentResponse);

            const result = streamText({
              model: openrouter.chat(GEMINI_MODEL),
              system: `
                You are a skilled summarizer and synthesizer of expert knowledge.
                Your role is to provide the user with a clear, coherent, and comprehensive answer based solely on the insights provided by various expert agents, without revealing that these insights come from multiple sources.
                Please focus on addressing the user's original query in a way that feels fresh and integrated, as if you are providing a singular expert opinion.
                You can also ask clarifying questions to the user if you think it is necessary.
                You should format your response in Markdown.
              `,
              messages: [
                { role: "user", content: `Original user input: ${this.messages[this.messages.length - 1]}` },
                { role: "user", content: `Expert insights: ${agentResponse}` },
              ],
              onFinish,
              onError: ({ error }) => {
                console.error("Error while streaming text:", error);
              },
            });

            result.mergeIntoDataStream(dataStream);
          } catch (error) {
            console.error("Error while processing agents:", error);
            return dataStream.writeData("Error while processing agents");
          }
        },
      });
    });
  }

  async executeTask(description: string, task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `scheduled message: ${description}`,
      },
    ]);
  }

  private async agentRouter(openrouter: OpenRouterProvider, query: Message[]): Promise<("schedule" | "finance" | "health" | "knowledge")[]> {
    return (await generateObject({
      model: openrouter.chat(GEMINI_MODEL),
      output: 'array',
      schema: z.enum(["schedule", "finance", "health", "knowledge"]),
      system: `
        You are a dynamic routing agent that outputs a JSON array mapping agent names to sub-queries.
        You should also think about the order in which the agents should be called, and order them in the array accordingly.
        Please be careful about calling too many agents at once if they might output duplicate responses, as this may lead to a long wait time for the user, but you are free to call multiple agents if you think it is necessary.
        Analyze the user input and determine which specialized agent(s) should process it.
      `,
      messages: query,
    })).object;
  }

  private async scheduleAgent(openrouter: OpenRouterProvider, query: Message[]) {
    console.log("Schedule agent invoked with query:");
    return (await generateText({
      model: openrouter.chat(GEMINI_MODEL),
      messages: query,
      system: `
        You are a scheduling assistant designed to help users plan and coordinate meetings, appointments, and events. Your goal is to provide clear scheduling options, resolve conflicts, consider time zones, and ask clarifying questions when details are ambiguous. Respond with concise, actionable scheduling recommendations that optimize the user’s time.
        You should analyze the user input from your the perspective of your expertise and provide a detailed answer to the user.
      `,
      maxSteps: 10,
    })).text;
  }

  private async financeAgent(openrouter: OpenRouterProvider, query: Message[]) {
    console.log("Finance agent invoked with query:");
    return (await generateText({
      model: openrouter.chat(GEMINI_MODEL),
      messages: query,
      system: `
        You are a finance expert with deep knowledge of personal budgeting, investments, market trends, and financial planning. Your role is to offer clear, responsible financial advice and insights based on the user's inquiry. Ensure that your recommendations are well-explained and include caveats such as “for informational purposes only” when necessary.
        You should analyze the user input from your the perspective of your expertise and provide a detailed answer to the user.
      `,
      maxSteps: 10,
    })).text;
  }

  private async healthAgent(openrouter: OpenRouterProvider, query: Message[]) {
    console.log("Health agent invoked with query:");
    return (await generateText({
      model: openrouter.chat(GEMINI_MODEL),
      messages: query,
      system: `
        You are a health and wellness assistant specializing in general medical advice, nutrition, fitness, and mental health. Provide accurate, balanced information while reminding users that your advice is informational and not a substitute for professional medical consultation. Ask clarifying questions if needed, and offer actionable wellness tips.
        You should analyze the user input from your the perspective of your expertise and provide a detailed answer to the user.
      `,
      maxSteps: 10,
    })).text;
  }

  private async knowledgeAgent(openrouter: OpenRouterProvider, query: Message[]) {
    console.log("Knowledge agent invoked with query:");
    return (await generateText({
      model: openrouter.chat(GEMINI_MODEL),
      messages: query,
      system: `
        You are a research assistant with expertise spanning science, technology, history, the arts, and more. Your task is to provide detailed, well-researched, and accurate responses to the user's questions. Ensure clarity, include context when needed, and cite reliable sources if applicable.
        You should analyze the user input from your the perspective of your expertise and provide a detailed answer to the user.
      `,
      maxSteps: 10,
    })).text;
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!env.OPENROUTER_API_KEY) {
      console.error(
        "OPENROUTER_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
      return new Response("OPENROUTER_API_KEY is not set", { status: 500 });
    }

    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
