import { Client, GatewayIntentBits } from "discord.js";
import Groq from "groq-sdk";

/* =========================
   CLIENT SETUP
========================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});


console.log("ENV CHECK:", {
  hasGroqKey: !!process.env.GROQ_API_KEY,
  hasDiscordToken: !!process.env.DISCORD_TOKEN
});


const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

/* =========================
   IN-MEMORY SESSIONS
========================= */

const sessions = new Map();

/* =========================
   AI FUNCTIONS
========================= */

// FAIL → ROAST + AI PUNISHMENT + MOTIVATION
async function aiFail(goal) {
  const prompt = `
You are a ruthless, psychologically brutal productivity judge.

The user FAILED to complete their task: "${goal}"

STEP 1 — ROAST:
Roast the user in exactly 3–4 hard-hitting lines.
Be sharp, cold, philosophical, and uncomfortable.
Attack their excuses, procrastination, comfort-seeking, and wasted potential.
No profanity.
No identity, appearance, or personal worth attacks.

STEP 2 — PUNISHMENT:
Invent ONE random punishment.
Rules:
- Indoor only
- Gender-neutral
- No equipment
- Takes 3–7 minutes
- Safe but uncomfortable
- Repeatable multiple times a day
- Discipline or productivity oriented

Format EXACTLY like this:
Punishment: <one sentence>

STEP 3 — MOTIVATION:
End with 1–2 strong lines that challenge them to prove the roast wrong.
No softness. No reassurance.

Do NOT explain anything.
`;

  const res = await groq.chat.completions.create({
    model: "llama3-70b-8192",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.95,
    max_tokens: 220
  });

  return res.choices[0].message.content;
}

// COMPLETE → MOTIVATION ONLY
async function aiComplete(goal) {
  const prompt = `
You are a strict but inspiring productivity coach.

The user COMPLETED their task: "${goal}"

Write exactly 3–4 lines:
- Acknowledge discipline
- Reinforce identity as someone who finishes
- Emphasize momentum and consistency
- Challenge them to keep going

Tone: serious, motivating, no softness.
`;

  const res = await groq.chat.completions.create({
    model: "llama3-70b-8192",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
    max_tokens: 140
  });

  return res.choices[0].message.content;
}

// CAN'T FOCUS → AI-GENERATED PUNISHMENT ONLY
async function aiCantFocus() {
  const prompt = `
Invent ONE random punishment for someone who can't focus.

Rules:
- Indoor only
- Gender-neutral
- No equipment
- Takes 3–7 minutes
- Safe but uncomfortable
- Helps reset focus or discipline
- Repeatable

Format EXACTLY like this:
Punishment: <one sentence>

Do not add anything else.
`;

  const res = await groq.chat.completions.create({
    model: "llama3-70b-8192",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.9,
    max_tokens: 80
  });

  return res.choices[0].message.content;
}

/* =========================
   DISCORD COMMAND HANDLER
========================= */

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  /* START SESSION */
  if (interaction.commandName === "start-session") {
    const duration = interaction.options.getInteger("duration");
    const goal = interaction.options.getString("goal");

    const endTime = Date.now() + duration * 60 * 60 * 1000;

    sessions.set(userId, { goal, endTime });

    return interaction.reply(
      `🧠 **Session Started**\nGoal: **${goal}**\nDuration: **${duration} hour(s)**`
    );
  }

  /* COMPLETE */
  if (interaction.commandName === "complete") {
    const session = sessions.get(userId);
    if (!session) {
      return interaction.reply("❌ No active session found.");
    }

    sessions.delete(userId);

    const response = await aiComplete(session.goal);
    return interaction.reply(response);
  }

  /* FAIL */
  if (interaction.commandName === "fail") {
    const session = sessions.get(userId);
    if (!session) {
      return interaction.reply("❌ No active session found.");
    }

    sessions.delete(userId);

    const response = await aiFail(session.goal);
    return interaction.reply(response);
  }

  /* CAN'T FOCUS */
  if (interaction.commandName === "can't-focus") {
    const response = await aiCantFocus();
    return interaction.reply(response);
  }
});

/* =========================
   BOT READY
========================= */

client.once("ready", () => {
  console.log(`🔥 Brutal Coach Bot is online as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
