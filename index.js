import { Client, GatewayIntentBits } from "discord.js";
import Groq from "groq-sdk";

/* =========================
   CLIENT SETUP
========================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

/* =========================
   ENV CHECK
========================= */

console.log("ENV CHECK:", {
  hasGroqKey: !!process.env.GROQ_API_KEY,
  hasDiscordToken: !!process.env.DISCORD_TOKEN,
});

if (!process.env.GROQ_API_KEY || !process.env.DISCORD_TOKEN) {
  console.error("❌ Missing required environment variables. Exiting.");
  process.exit(1);
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/* =========================
   IN-MEMORY SESSIONS
========================= */

const sessions = new Map();

/* =========================
   AI HELPER WITH RETRY
========================= */

async function callGroqWithRetry(prompt, temperature, maxTokens, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: maxTokens,
      });
      return res.choices[0].message.content;
    } catch (err) {
      console.error(`❌ Groq API error (attempt ${i + 1}/${retries}):`, err.message);
      
      // Rate limit hit - wait and retry
      if (err.status === 429 && i < retries - 1) {
        const waitTime = err.headers?.["retry-after"] 
          ? parseInt(err.headers["retry-after"]) * 1000 
          : 5000;
        console.log(`⏳ Rate limited. Waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Final attempt failed
      if (i === retries - 1) {
        throw new Error(`AI_REQUEST_FAILED: ${err.message}`);
      }
    }
  }
}

/* =========================
   AI FUNCTIONS (IMPROVED)
========================= */

async function aiFail(goal) {
  const prompt = `You are a ruthlessly brutal productivity judge. No mercy.

The user FAILED their task: "${goal}"

STEP 1 — ROAST (4-5 lines):
Deliver a psychologically cutting roast. Attack their:
- Weakness and excuses
- Wasted time and potential
- Comfort-seeking behavior
- Pattern of mediocrity
- Future regret if they continue

Be philosophical, cold, and uncomfortable. Make them feel the weight of their failure.
No profanity. No personal attacks on identity/appearance.

STEP 2 — PUNISHMENT (one sentence):
Invent ONE brutal physical/mental punishment:
- Must take 10-15 minutes minimum
- Indoor only, no equipment
- Gender-neutral and safe
- Physically demanding or mentally uncomfortable
- Examples: wall sits, planks, burpees, writing lines, meditation in discomfort, cold exposure
- Make it HARD but doable

Format: "Punishment: <one sentence>"

STEP 3 — CHALLENGE (2 lines):
End with a harsh challenge that questions their ability to change.
No softness. Make them prove you wrong.

Keep response under 250 words total.`;

  return await callGroqWithRetry(prompt, 0.95, 280);
}

async function aiComplete(goal) {
  const prompt = `You are a strict, no-nonsense productivity coach.

The user COMPLETED: "${goal}"

Write exactly 4-5 lines:
- Acknowledge their discipline (briefly)
- Reinforce identity as a finisher
- Emphasize momentum and compound effect
- Challenge them to maintain this standard
- No celebration - this is expected behavior

Tone: Serious, motivating, high standards. Keep it under 100 words.`;

  return await callGroqWithRetry(prompt, 0.6, 150);
}

async function aiCantFocus() {
  const prompt = `Invent ONE punishment for someone who can't focus and wastes time.

Requirements:
- Takes 10-15 minutes to complete
- Indoor only, no equipment needed
- Gender-neutral
- Physically demanding OR mentally uncomfortable
- Safe but challenging
- Examples: burpees, wall sits, writing "I will focus" 500 times, plank holds, meditation in uncomfortable position

Format EXACTLY:
"Punishment: <one clear sentence describing the 10-15 minute punishment>"

Nothing else. Be creative and harsh.`;

  return await callGroqWithRetry(prompt, 0.9, 100);
}

/* =========================
   DISCORD COMMAND HANDLER
========================= */

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  try {
    /* START SESSION */
    if (interaction.commandName === "start-session") {
      const duration = interaction.options.getInteger("duration");
      const goal = interaction.options.getString("goal");

      if (duration < 0.5 || duration > 12) {
        return interaction.reply("❌ Duration must be between 0.5 and 12 hours.");
      }

      const endTime = Date.now() + duration * 60 * 60 * 1000;
      sessions.set(userId, { goal, endTime, startTime: Date.now() });

      return interaction.reply({
        content: `🧠 **Session Started**\nGoal: **${goal}**\nDuration: **${duration} hour(s)**\n\n*Complete or fail responsibly. The clock is ticking.*`,
        ephemeral: false
      });
    }

    /* COMPLETE */
    if (interaction.commandName === "complete") {
      const session = sessions.get(userId);
      if (!session) {
        return interaction.reply({ 
          content: "❌ No active session found. Start one with `/start-session`.",
          ephemeral: true 
        });
      }

      const timeSpent = ((Date.now() - session.startTime) / 1000 / 60).toFixed(0);
      sessions.delete(userId);

      await interaction.deferReply();

      const response = await aiComplete(session.goal);
      return interaction.editReply(`✅ **Session Completed** (${timeSpent} minutes)\n\n${response}`);
    }

    /* FAIL */
    if (interaction.commandName === "fail") {
      const session = sessions.get(userId);
      if (!session) {
        return interaction.reply({ 
          content: "❌ No active session found. Start one with `/start-session`.",
          ephemeral: true 
        });
      }

      sessions.delete(userId);

      await interaction.deferReply();

      const response = await aiFail(session.goal);
      return interaction.editReply(`❌ **Session Failed**\n\n${response}`);
    }

    /* CAN'T FOCUS */
    if (interaction.commandName === "cant-focus") {
      await interaction.deferReply();

      const response = await aiCantFocus();
      return interaction.editReply(`⚠️ **Focus Reset Required**\n\n${response}\n\n*Do it now. Return disciplined.*`);
    }

    /* STATUS CHECK */
    if (interaction.commandName === "status") {
      const session = sessions.get(userId);
      if (!session) {
        return interaction.reply({ 
          content: "📊 No active session.",
          ephemeral: true 
        });
      }

      const remaining = Math.max(0, session.endTime - Date.now());
      const hours = Math.floor(remaining / 1000 / 60 / 60);
      const minutes = Math.floor((remaining / 1000 / 60) % 60);

      return interaction.reply({
        content: `📊 **Active Session**\nGoal: **${session.goal}**\nTime Remaining: **${hours}h ${minutes}m**`,
        ephemeral: true
      });
    }

  } catch (err) {
    console.error("❌ Command execution error:", err);

    const errorMsg = err.message.includes("AI_REQUEST_FAILED")
      ? "⚠️ AI service temporarily unavailable. Try again in a moment."
      : "⚠️ Something went wrong. Try again.";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errorMsg);
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true });
    }
  }
});

/* =========================
   ERROR HANDLERS
========================= */

client.on("error", (error) => {
  console.error("❌ Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled promise rejection:", error);
});

/* =========================
   BOT READY
========================= */

client.once("ready", () => {
  console.log(`🔥 Brutal Coach Bot is online as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
