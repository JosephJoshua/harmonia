import { tool } from "ai";
import { z } from "zod";
import { agentContext } from "./server";

// ===== Finance agent tools =====
const addTransactions = tool({
  description: "Record a new financial transaction in the user's history",
  parameters: z.object({
    transactions: z.array(
      z.object({
        date: z.string().describe("Date of transaction in YYYY-MM-DD format"),
        description: z.string().describe("Description of the transaction"),
        amount: z
          .number()
          .describe("Amount in dollars (negative for expenses)"),
      })
    ).describe("The transactions to be recorded"),
  }),
  execute: async ({ transactions }) => {
    const agent = agentContext.getStore();
    if (!agent) throw new Error("No agent found in context");

    console.log(agent.state);

    agent.setState({
      ...agent.state,
      transactions: [
        ...agent.state.transactions,
        ...transactions.map((transaction) => ({
          date: new Date(transaction.date),
          description: transaction.description,
          amount: transaction.amount,
        })),
      ],
    });

    console.log(agent.state);

    return `Transactions recorded: ${transactions}`;
  },
});

const getTransactionHistory = tool({
  description: "Retrieve the user's financial transaction history",
  parameters: z.object({
    limit: z
      .number()
      .optional()
      .describe("Number of transactions to return, defaults to all"),
  }),
  execute: async ({ limit }) => {
    const agent = agentContext.getStore();
    if (!agent) throw new Error("No agent found in context");

    if (!agent.state?.transactions || agent.state.transactions.length === 0) {
      return "No transaction history found.";
    }

    const transactions = limit
      ? agent.state.transactions.slice(-limit)
      : agent.state.transactions;

    return JSON.stringify(transactions);
  },
});

// ===== Health agent tools =====
const updateHealthMetrics = tool({
  description: "Update the user's health metrics",
  parameters: z.object({
    weight: z.number().optional().describe("User's weight in kg"),
    height: z.number().optional().describe("User's height in cm"),
  }),
  execute: async ({ weight, height }) => {
    const agent = agentContext.getStore();
    if (!agent) throw new Error("No agent found in context");

    if (weight !== undefined) agent.setState({ ...agent.state, weight });
    if (height !== undefined) agent.setState({ ...agent.state, height });

    weight = agent.state.weight;
    height = agent.state.height;

    let response = "Health metrics updated:";
    if (weight) response += ` Weight: ${weight}kg`;
    if (height) response += ` Height: ${height}cm`;

    if (weight && height) {
      const heightInMeters = height / 100;
      const bmi = weight / (heightInMeters * heightInMeters);
      response += ` BMI: ${bmi.toFixed(2)}`;
    }

    return response;
  },
});

const getHealthMetrics = tool({
  description: "Get the user's current health metrics including weight, height, and BMI",
  parameters: z.object({}),
  execute: async () => {
    const agent = agentContext.getStore();
    if (!agent) throw new Error("No agent found in context");

    if (!agent.state) return "No health metrics found.";

    const metrics: { weight: number | undefined; height: number | undefined; bmi: number | undefined } =
      {
        weight: agent.state.weight,
        height: agent.state.height,
        bmi: undefined,
      };

    if (metrics.weight && metrics.height) {
      const heightInMeters = metrics.height / 100;
      metrics.bmi = metrics.weight / (heightInMeters * heightInMeters);
    }

    return JSON.stringify(metrics);
  },
});

// ===== Knowledge agent tools =====
const storeNote = tool({
  description: "Store a note or piece of information for the user",
  parameters: z.object({
    title: z.string().describe("Title or topic of the note"),
    content: z.string().describe("Content of the note"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional tags for categorization"),
  }),
  execute: async ({ title, content, tags }) => {
    const agent = agentContext.getStore();
    if (!agent) throw new Error("No agent found in context");

    const timestamp = new Date();
    const note = { title, content, timestamp, tags: tags || [] };

    agent.setState({
      ...agent.state,
      notes: [...agent.state.notes, note],
    });

    return `Note "${title}" saved successfully.`;
  },
});

const getNotes = tool({
  description: "Retrieve notes stored by the user",
  parameters: z.object({
    tag: z.string().optional().describe("Filter notes by tag"),
    query: z
      .string()
      .optional()
      .describe("Search term to find in title or content"),
  }),
  execute: async ({ tag, query }) => {
    const agent = agentContext.getStore();
    if (!agent) throw new Error("No agent found in context");

    if (!agent.state?.notes || agent.state.notes.length === 0) {
      return "No notes found.";
    }

    let notes = agent.state.notes;

    if (tag) {
      notes = notes.filter((note) => note.tags?.includes(tag));
    }

    if (query) {
      const queryLower = query.toLowerCase();
      notes = notes.filter(
        (note) =>
          note.title.toLowerCase().includes(queryLower) ||
          note.content.toLowerCase().includes(queryLower)
      );
    }

    return JSON.stringify(notes);
  },
});

export const tools = {
  finance: {
    addTransactions,
    getTransactionHistory,
  },
  health: {
    updateHealthMetrics,
    getHealthMetrics,
  },
  knowledge: {
    storeNote,
    getNotes,
  },
};

export const executions = {};
