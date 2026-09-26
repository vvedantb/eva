/**
 * Pure helpers for the emoji-suggestion action: the reactions Jev picks from,
 * and how its per-option probabilities turn back into emoji.
 *
 * Runtime-free so the `"use node"` action stays a thin wrapper and the ranking
 * rules can be tested without a gateway call.
 */

/** Search box text cap — a query, not a message. */
export const MAX_EMOJI_QUERY_CHARS = 200;
/** How many emoji the action returns; matches the picker's quick-react row. */
export const MAX_EMOJI_SUGGESTIONS = 6;
/**
 * Jev spreads probability across every option, so with ~150 of them a
 * genuine match can sit well under 10%. This only drops the long tail.
 */
export const MIN_EMOJI_PROBABILITY = 0.02;

/**
 * The reactions Jev chooses between, keyed by a plain-English name. Jev
 * answers `choice` questions over at most 255 named options and never writes
 * text, so it can only suggest from a fixed list; this one covers what people
 * react with in review threads. Names, not glyphs, are the option keys — the
 * model reads words more reliably than code points.
 */
export const EMOJI_CANDIDATES: ReadonlyArray<{ name: string; emoji: string }> =
  [
    { name: "thumbs up, approve, agree, lgtm", emoji: "👍" },
    { name: "thumbs down, disagree, reject", emoji: "👎" },
    { name: "red heart, love", emoji: "❤️" },
    { name: "party popper, celebrate, congrats", emoji: "🎉" },
    { name: "grinning face, happy", emoji: "😄" },
    { name: "rocket, ship it, launch, fast", emoji: "🚀" },
    { name: "eyes, looking, watching, reviewing", emoji: "👀" },
    { name: "face with tears of joy, lol, funny", emoji: "😂" },
    { name: "rolling on the floor laughing", emoji: "🤣" },
    { name: "smiling face with smiling eyes", emoji: "😊" },
    { name: "slightly smiling face", emoji: "🙂" },
    { name: "winking face", emoji: "😉" },
    { name: "smiling face with heart eyes, adore", emoji: "😍" },
    { name: "star-struck, amazed", emoji: "🤩" },
    { name: "smiling face with sunglasses, cool", emoji: "😎" },
    { name: "thinking face, hmm, considering", emoji: "🤔" },
    { name: "face with monocle, inspecting, scrutinise", emoji: "🧐" },
    { name: "neutral face, meh", emoji: "😐" },
    { name: "expressionless face, unimpressed", emoji: "😑" },
    { name: "face with rolling eyes, annoyed", emoji: "🙄" },
    { name: "grimacing face, awkward, yikes", emoji: "😬" },
    { name: "confused face", emoji: "😕" },
    { name: "worried face", emoji: "😟" },
    { name: "crying face, sad", emoji: "😢" },
    { name: "loudly crying face, devastated", emoji: "😭" },
    { name: "angry face", emoji: "😠" },
    { name: "enraged face, furious", emoji: "😡" },
    { name: "face screaming in fear, shocked, horror", emoji: "😱" },
    { name: "astonished face, surprised, wow", emoji: "😲" },
    { name: "exploding head, mind blown", emoji: "🤯" },
    { name: "sweating face, phew, relief", emoji: "😅" },
    { name: "relieved face", emoji: "😌" },
    { name: "sleeping face, tired, boring", emoji: "😴" },
    { name: "yawning face, sleepy", emoji: "🥱" },
    { name: "face with medical mask, sick", emoji: "😷" },
    { name: "nauseated face, gross", emoji: "🤢" },
    { name: "zany face, silly, crazy", emoji: "🤪" },
    { name: "upside-down face, sarcasm", emoji: "🙃" },
    { name: "smirking face", emoji: "😏" },
    { name: "hugging face, hug, thanks", emoji: "🤗" },
    { name: "face with hand over mouth, oops", emoji: "🤭" },
    { name: "shushing face, quiet, secret", emoji: "🤫" },
    { name: "zipper-mouth face, no comment", emoji: "🤐" },
    { name: "pleading face, please", emoji: "🥺" },
    { name: "partying face, birthday", emoji: "🥳" },
    { name: "saluting face, yes sir, on it", emoji: "🫡" },
    { name: "melting face, overwhelmed", emoji: "🫠" },
    {
      name: "face with open eyes and hand over mouth, embarrassed",
      emoji: "🫢",
    },
    { name: "skull, dead, dying of laughter", emoji: "💀" },
    { name: "pile of poo", emoji: "💩" },
    { name: "clown face, joke", emoji: "🤡" },
    { name: "ghost", emoji: "👻" },
    { name: "alien", emoji: "👽" },
    { name: "robot, ai, bot, automation", emoji: "🤖" },
    { name: "brain, smart, clever idea", emoji: "🧠" },
    { name: "clapping hands, applause, well done", emoji: "👏" },
    { name: "raising hands, hooray", emoji: "🙌" },
    { name: "folded hands, thank you, please, pray", emoji: "🙏" },
    { name: "waving hand, hello, goodbye", emoji: "👋" },
    { name: "ok hand, fine, perfect", emoji: "👌" },
    { name: "victory hand, peace", emoji: "✌️" },
    { name: "crossed fingers, good luck, hope", emoji: "🤞" },
    { name: "handshake, deal, agreement", emoji: "🤝" },
    { name: "flexed biceps, strong, effort", emoji: "💪" },
    { name: "raised fist, solidarity", emoji: "✊" },
    { name: "oncoming fist, fist bump", emoji: "👊" },
    { name: "call me hand, shaka", emoji: "🤙" },
    { name: "index pointing up, this, good point", emoji: "☝️" },
    { name: "backhand index pointing right", emoji: "👉" },
    { name: "raised hand, question, stop", emoji: "✋" },
    { name: "writing hand, notes, documenting", emoji: "✍️" },
    { name: "person shrugging, dunno", emoji: "🤷" },
    { name: "person facepalming, doh", emoji: "🤦" },
    { name: "person bowing, respect, sorry", emoji: "🙇" },
    { name: "person running, hurry", emoji: "🏃" },
    { name: "ninja, stealth", emoji: "🥷" },
    { name: "detective, investigate, debugging", emoji: "🕵️" },
    { name: "technologist, developer, coding", emoji: "🧑‍💻" },
    { name: "fire, hot, lit, amazing", emoji: "🔥" },
    { name: "sparkles, new, shiny, magic", emoji: "✨" },
    { name: "star, favourite", emoji: "⭐" },
    { name: "glowing star, outstanding", emoji: "🌟" },
    { name: "high voltage, zap, quick, performance", emoji: "⚡" },
    { name: "hundred points, 100, perfect score", emoji: "💯" },
    { name: "collision, boom, crash", emoji: "💥" },
    { name: "light bulb, idea", emoji: "💡" },
    { name: "bullseye, direct hit, on target", emoji: "🎯" },
    { name: "trophy, winner", emoji: "🏆" },
    { name: "1st place medal, gold", emoji: "🥇" },
    { name: "crown, king, queen", emoji: "👑" },
    { name: "gem stone, gem, precious", emoji: "💎" },
    { name: "money bag, cost, pricing", emoji: "💰" },
    { name: "chart increasing, growth, metrics up", emoji: "📈" },
    { name: "chart decreasing, decline, metrics down", emoji: "📉" },
    { name: "bar chart, stats, data", emoji: "📊" },
    { name: "check mark button, done, complete", emoji: "✅" },
    { name: "check mark, yes, correct", emoji: "✔️" },
    { name: "cross mark, no, wrong, failed", emoji: "❌" },
    { name: "warning, caution", emoji: "⚠️" },
    { name: "no entry, blocked, forbidden", emoji: "⛔" },
    { name: "stop sign", emoji: "🛑" },
    { name: "red question mark, question, unclear", emoji: "❓" },
    { name: "red exclamation mark, important", emoji: "❗" },
    { name: "double exclamation mark, urgent", emoji: "‼️" },
    { name: "police car light, alert, incident, emergency", emoji: "🚨" },
    { name: "bug, defect, error", emoji: "🐛" },
    { name: "wrench, fix, repair", emoji: "🔧" },
    { name: "hammer and wrench, tools, maintenance", emoji: "🛠️" },
    { name: "gear, settings, config", emoji: "⚙️" },
    { name: "construction, work in progress, wip", emoji: "🚧" },
    { name: "locked, secure, security", emoji: "🔒" },
    { name: "key, access, credentials", emoji: "🔑" },
    { name: "shield, protected, safe", emoji: "🛡️" },
    { name: "magnifying glass, search, look into", emoji: "🔍" },
    { name: "link, url", emoji: "🔗" },
    { name: "pushpin, pinned, note", emoji: "📌" },
    { name: "memo, write up, docs", emoji: "📝" },
    { name: "books, documentation, reading", emoji: "📚" },
    { name: "package, dependency, release", emoji: "📦" },
    { name: "wastebasket, delete, remove", emoji: "🗑️" },
    { name: "broom, cleanup, refactor", emoji: "🧹" },
    { name: "test tube, testing, experiment", emoji: "🧪" },
    { name: "microscope, deep dive, analysis", emoji: "🔬" },
    { name: "puzzle piece, integration, fits", emoji: "🧩" },
    { name: "art palette, design, ui", emoji: "🎨" },
    { name: "laptop, computer", emoji: "💻" },
    { name: "mobile phone", emoji: "📱" },
    { name: "calendar, schedule, date", emoji: "📅" },
    { name: "hourglass, waiting, pending", emoji: "⏳" },
    { name: "alarm clock, deadline, reminder", emoji: "⏰" },
    { name: "stopwatch, timing, speed", emoji: "⏱️" },
    { name: "bell, notification", emoji: "🔔" },
    { name: "megaphone, announcement", emoji: "📣" },
    { name: "speech balloon, comment, discuss", emoji: "💬" },
    { name: "envelope, email, mail", emoji: "✉️" },
    { name: "hospital, nhs, health", emoji: "🏥" },
    { name: "pill, medicine", emoji: "💊" },
    { name: "house, home", emoji: "🏠" },
    { name: "globe, world, international", emoji: "🌍" },
    { name: "sun, sunny, bright", emoji: "☀️" },
    { name: "rainbow", emoji: "🌈" },
    { name: "snowflake, cold, freeze", emoji: "❄️" },
    { name: "seedling, growth, new start", emoji: "🌱" },
    { name: "hot beverage, coffee, break", emoji: "☕" },
    { name: "beer mugs, cheers", emoji: "🍻" },
    { name: "pizza", emoji: "🍕" },
    { name: "birthday cake", emoji: "🎂" },
    { name: "wrapped gift, present", emoji: "🎁" },
    { name: "balloon", emoji: "🎈" },
    { name: "confetti ball", emoji: "🎊" },
    { name: "musical notes, music", emoji: "🎶" },
    { name: "video game, gaming", emoji: "🎮" },
    { name: "goat, greatest of all time", emoji: "🐐" },
    { name: "unicorn, rare, magical", emoji: "🦄" },
    { name: "turtle, slow", emoji: "🐢" },
    { name: "snail, very slow", emoji: "🐌" },
    { name: "dog, puppy", emoji: "🐶" },
    { name: "cat, kitten", emoji: "🐱" },
    { name: "monkey covering eyes, see no evil", emoji: "🙈" },
    { name: "rotating light arrows, retry, repeat, in progress", emoji: "🔄" },
    { name: "arrow up, upgrade, increase", emoji: "⬆️" },
    { name: "arrow down, downgrade, decrease", emoji: "⬇️" },
    { name: "plus, add, +1", emoji: "➕" },
    { name: "minus, subtract, -1", emoji: "➖" },
    { name: "orange heart", emoji: "🧡" },
    { name: "yellow heart", emoji: "💛" },
    { name: "green heart", emoji: "💚" },
    { name: "blue heart", emoji: "💙" },
    { name: "purple heart", emoji: "💜" },
    { name: "broken heart, heartbroken", emoji: "💔" },
    { name: "sparkling heart", emoji: "💖" },
    { name: "green circle, go, ok, healthy", emoji: "🟢" },
    { name: "yellow circle, caution, degraded", emoji: "🟡" },
    { name: "red circle, down, critical", emoji: "🔴" },
    { name: "white flag, give up, surrender", emoji: "🏳️" },
    { name: "chequered flag, finished, finish line", emoji: "🏁" },
    { name: "mountain, big effort", emoji: "⛰️" },
  ];

const emojiByName = new Map(
  EMOJI_CANDIDATES.map((candidate) => [
    candidate.name.toLowerCase(),
    candidate.emoji,
  ]),
);

/**
 * Turns Jev's per-option probabilities back into emoji, best first. Options
 * Jev invented and the long tail are dropped rather than ranked.
 */
export function rankEmoji(probabilities: Record<string, number>): string[] {
  const ranked: { emoji: string; probability: number }[] = [];
  for (const [name, probability] of Object.entries(probabilities)) {
    if (probability < MIN_EMOJI_PROBABILITY) continue;
    const emoji = emojiByName.get(name.trim().toLowerCase());
    if (emoji === undefined) continue;
    ranked.push({ emoji, probability });
  }
  ranked.sort((a, b) => b.probability - a.probability);
  return ranked.slice(0, MAX_EMOJI_SUGGESTIONS).map((entry) => entry.emoji);
}
