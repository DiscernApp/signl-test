import { useState, useRef, useEffect } from "react";

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Jost:wght@300;400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:      #F8F7F5;
      --surface: #F1F0ED;
      --ink:     #141412;
      --teal:    #1D9E75;
      --teal-lt: #5DCAA5;
      --teal-bg: rgba(29,158,117,0.07);
      --muted:   #767470;
      --border:  rgba(20,20,18,0.12);
      --bstrong: rgba(20,20,18,0.28);
      --green:   #2A7A58;
      --amber:   #B06A20;
      --serif:   'Cormorant Garamond', Georgia, serif;
      --sans:    'Jost', system-ui, sans-serif;
    }
    html, body, #root { height: 100%; }
    body { background:var(--bg); color:var(--ink); font-family:var(--sans); font-weight:300; -webkit-font-smoothing:antialiased; }
    ::-webkit-scrollbar { width:3px; }
    ::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }
    @keyframes fadeUp    { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
    @keyframes spin      { to{transform:rotate(360deg)} }
    @keyframes slideUp   { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
    @keyframes pulse     { 0%,100%{opacity:0.45} 50%{opacity:1} }
    @keyframes pop       { 0%{transform:scale(0.92);opacity:0} 60%{transform:scale(1.04)} 100%{transform:scale(1);opacity:1} }
    @keyframes scanline  { 0%{transform:translateY(-100%)} 100%{transform:translateY(400%)} }
  `}</style>
);

// ─── API ──────────────────────────────────────────────────────────────────────
async function callClaude(messages, system, img = null, maxTokens = 1000) {
  const last = messages[messages.length - 1];
  let content = last.content;
  if (img && typeof content === "string") {
    content = [
      { type:"image", source:{ type:"base64", media_type:"image/jpeg", data:img } },
      { type:"text",  text:content }
    ];
  }
  
  // Call serverless proxy endpoint instead of API directly (solves CORS issue)
  const res = await fetch("/api/claude", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      messages:[...messages.slice(0,-1), { role:last.role, content }],
      system,
      image: img,
      maxTokens
    })
  });
  
  const d = await res.json();
  
  if (!res.ok || !d.success) {
    throw new Error(d.error || "API request failed");
  }
  
  return d.text ?? "";
}

function parseJSON(t) {
  try { return JSON.parse(t.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim()); }
  catch { return null; }
}

async function sGet(k) {
  try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
async function sSet(k, v) { try { await window.storage.set(k, JSON.stringify(v)); } catch {} }

// ─── Constants ────────────────────────────────────────────────────────────────
const SCREENS        = { HOME:"home", SIGNALS:"signals", REPORT:"report" };
// ─── Config ───────────────────────────────────────────────────────────────────
// ADMIN: Adjust these values to change app behaviour without touching logic.
const CONFIG = {
  SNAPS_REQUIRED:  3,   // Number of snaps before report unlocks. Recommended: 3–5.
  MIN_FOR_PERSONA: 3,   // Number of snaps before persona synthesis unlocks. Must be ≤ SNAPS_REQUIRED.
};
const SNAPS_REQUIRED  = CONFIG.SNAPS_REQUIRED;
const MIN_FOR_PERSONA = CONFIG.MIN_FOR_PERSONA;
const ARCHETYPES     = ["Visionary", "Authority", "Challenger", "Connector", "Craftsperson"];
const CONTEXTS       = ["Board room & leadership", "Client-facing & pitching", "Public speaking & keynotes", "Peer collaboration"];

// ─── Utility ──────────────────────────────────────────────────────────────────
function inferCategory(desc) {
  const d = (desc||"").toLowerCase();
  if (/shirt|blouse|top|t-shirt|sweater|jumper|knit|turtleneck|crew/.test(d)) return "Tops";
  if (/trouser|pant|jean|skirt|short/.test(d)) return "Bottoms";
  if (/blazer|jacket|coat|overcoat|trench|vest/.test(d)) return "Outerwear";
  if (/dress|suit|gown/.test(d)) return "Dresses & Suits";
  if (/shoe|boot|sneaker|loafer|heel|oxford|trainer/.test(d)) return "Shoes";
  if (/bag|tote|clutch|briefcase|backpack/.test(d)) return "Bags";
  if (/watch|belt|scarf|tie|jewel|necklace|ring|earring|glasses/.test(d)) return "Accessories";
  return "Other";
}

function avgSignalsFrom(snaps) {
  if (!snaps.length) return null;
  return {
    socialCategory:    +(snaps.reduce((s,x) => s+(x.signals?.socialCategory||5),0)/snaps.length).toFixed(1),
    cognitiveState:    +(snaps.reduce((s,x) => s+(x.signals?.cognitiveState||5),0)/snaps.length).toFixed(1),
    status:            +(snaps.reduce((s,x) => s+(x.signals?.status||5),0)/snaps.length).toFixed(1),
    aestheticCoherence:+(snaps.reduce((s,x) => s+(x.signals?.aestheticCoherence||5),0)/snaps.length).toFixed(1),
  };
}

// ─── AI Prompts ───────────────────────────────────────────────────────────────
const SNAP_ANALYSIS_SYSTEM = `You are a Corporate Anthropologist specialising in professional visual signalling, working within a peer-reviewed research framework (Hester & Hehman, 2023). Decode what this outfit communicates in organisational contexts — not fashion commentary, but signal analysis across four dimensions.

IMPORTANT — CONTEXT PRINCIPLE: If no occasion or setting has been specified, read this outfit in a general professional register and note where the read may shift with context. An outfit cannot be fully decoded in isolation from occasion.

FOUR ANALYTICAL DIMENSIONS:

1. SOCIAL CATEGORY — Who does this person appear to be? What professional tribe or archetype does this outfit signal? What do they seem to stand for? Look for tribal markers: industry codes, in-group signals, archetype cues (Visionary, Authority, Challenger, Connector, Craftsperson). Rate 1–10 where 1=ambiguous/unreadable tribe and 10=highly legible, specific archetype.

2. COGNITIVE STATE — What does this person appear to want or be trying to do right now? Is the outfit contextually aligned with what a professional in their apparent role would wear for the occasion? Incoherence between perceived role and outfit signals distraction or low intentionality. Rate 1–10 where 1=context misaligned and 10=deeply occasion-appropriate.

3. STATUS — What does this project about power, resources, and standing? Apply three lenses: (a) quality cues — fabric, construction, fit precision — which land in under 129ms before conscious processing; (b) conspicuous vs inconspicuous signalling — overt logos vs quiet excellence; (c) sprezzatura — a high-status item worn with nonchalant ease often signals more authority than conventional formalwear. Rate 1–10 where 1=status-neutral or actively undermining and 10=high status clearly and legibly projected.

4. AESTHETIC COHERENCE — Independently of what it signals, does this outfit look considered? Assess colour harmony, proportion, and visual cohesion. An incoherent outfit creates ambiguity in all other dimensions — intentionality amplifies every signal. Rate 1–10 where 1=visually incoherent and 10=highly considered composition.

Return ONLY valid JSON:
{
  "signals": { "socialCategory": 6, "cognitiveState": 7, "status": 5, "aestheticCoherence": 8 },
  "itemsDetected": ["Item description", "Item description"],
  "read": "2–3 sentences. Interpret the social signal of this outfit across the four dimensions — what does it project professionally? Reference specific garments and be observational, not prescriptive. Note any context dependency. Example tone: 'The unstructured blazer over a clean crew-neck reads as a considered Authority signal with strong aesthetic coherence — the cognitive state alignment would shift significantly between a board context and a creative one.'",
  "contextFit": {
    "highStakes": "Strong | Moderate | Limited",
    "creative": "Strong | Moderate | Limited",
    "collaborative": "Strong | Moderate | Limited"
  },
  "signalTags": ["Tag1","Tag2","Tag3"]
}

Signal scoring guidance:
- socialCategory: 1=ambiguous tribe, 10=legible specific archetype
- cognitiveState: 1=context misaligned or unreadable intent, 10=deeply occasion-appropriate
- status: 1=status neutral or undermining, 10=high status clearly projected (account for fit, quality, sprezzatura)
- aestheticCoherence: 1=visually incoherent, 10=highly considered composition

Signal tags: 1–3 evocative phrases referencing the dominant signal read (e.g. "Quiet Authority", "Considered Presence", "Legible Challenger"). Never use fashion terms.`;

const buildPersonaSynthesisSystem = (snaps) => {
  const history = snaps.map((s,i) =>
    `Outfit ${i+1}: socialCategory=${s.signals?.socialCategory}, cognitiveState=${s.signals?.cognitiveState}, status=${s.signals?.status}, aestheticCoherence=${s.signals?.aestheticCoherence}. Tags: ${s.signalTags?.join(", ")}. Read: "${s.read}"`
  ).join("\n");
  return `You are reading the pattern across someone's outfit photos and reflecting back what you consistently see. Not what they should be — what they are currently projecting.

TONE: Warm, direct, observational. Like a perceptive colleague who is honest because they respect you. Conversational — no academic language, no jargon, no framework names. Write the way a thoughtful person speaks, not the way a report reads.

CRITICAL RULES:
— Never define their brand or professional identity for them. You are showing them what the signals show, not telling them who they are.
— Never assume where they are heading. Only describe where the signals currently sit.
— Never use words like "synthesise", "archetype", "signal framework", "dimensions", or academic terminology. Plain English only.
— The headline should read like an observation, not a label. Something that makes them think "yes, that's what I've been trying to articulate."

OUTFIT HISTORY:
${history}

Return ONLY valid JSON:
{
  "headline": "A plain-English description of what consistently comes through across the reads. Not a job title or archetype label. Something like: 'Someone who looks like they've thought about how they show up — but hasn't yet said what kind of professional they are.' Or: 'Considered and capable. The kind of person a room trusts before they've spoken.' Make it specific to this data.",
  "summary": "2–3 sentences. What do the outfit reads consistently show? Start with what's working, then note what's less clear or variable. Reference specific tags or reads from the data. Write as if explaining it to the person directly — no passive voice, no hedging.",
  "dominantSignals": ["2–3 plain-English signal phrases drawn from the tags — no jargon"],
  "avgSignals": { "socialCategory": 6.5, "cognitiveState": 5.2, "status": 6.8, "aestheticCoherence": 7.1 },
  "strongestContext": "One sentence. The type of room or situation where their current outfits work best — be specific, not generic.",
  "gapOpportunity": "One sentence. The single most useful thing they could shift — not fashion advice, just the signal observation. What's missing that would make the picture sharper?",
  "evolution": "One sentence. Is the signal consistent across reads, or does it shift? If it shifts, note what changes and what stays the same."
}`;
};

const buildGapAnalysisSystem = (snaps, aspirations) => {
  const history = snaps.map((s,i) =>
    `Outfit ${i+1}: socialCategory=${s.signals?.socialCategory}, cognitiveState=${s.signals?.cognitiveState}, status=${s.signals?.status}, aestheticCoherence=${s.signals?.aestheticCoherence}. Tags: ${s.signalTags?.join(", ")}. Read: "${s.read}"`
  ).join("\n");
  const avg = avgSignalsFrom(snaps);
  const hasAspirations = aspirations?.archetype || aspirations?.context || aspirations?.word;
  return `You are showing someone the gap between what their outfits currently project and — where they've told us — what they want to project. Your job is to describe what you see honestly, without assuming anything they haven't told you.

TONE: Direct and conversational. Like an honest friend who has looked at the photos and the answers and is telling you what they actually see. Not academic, not formal. No jargon. No framework names. Write the way a thoughtful person talks.

CRITICAL RULES:
— Only reference a destination or target if the aspirations data below contains specific answers. If aspirations are empty or sparse ("not specified"), describe the current signal pattern honestly without inventing a direction.
— When you reference what the user said, always attribute it explicitly: "You said you want to project X" or "You described your context as Y." Never state their goals as if they were obvious — only as reported.
— The gap labels (currentPersonaLabel, aspirationalPersonaLabel) should be plain-English descriptions, not archetype names. E.g. "Someone who looks capable but hasn't yet said what kind" rather than "Institutional Pragmatist."
— Adjustments should be plain observations about what would shift the signal — not styling instructions.
— The closing note should be honest about what's hard to see alone, without being salesy.

OUTFIT HISTORY (${snaps.length} reads):
${history}

AVERAGE SIGNALS: socialCategory=${avg?.socialCategory}, cognitiveState=${avg?.cognitiveState}, status=${avg?.status}, aestheticCoherence=${avg?.aestheticCoherence}

${hasAspirations ? `WHAT THEY'VE TOLD US:
They want to project: ${aspirations?.archetype || "not stated"}
Their priority context: ${aspirations?.context || "not stated"}
The word they want to own: "${aspirations?.word || "not stated"}"` : `ASPIRATIONS: Not provided. Describe the current signal pattern honestly without assuming a destination.`}

Return ONLY valid JSON:
{
  "currentPersonaLabel": "Plain-English description of what the outfits currently say — not a label, a description. E.g. 'Capable and considered, but not yet specific.'",
  "aspirationalPersonaLabel": "${hasAspirations ? "Plain-English description of what they've said they're aiming for — drawn from their actual answers, attributed." : "Not applicable — no aspirations stated. Use: 'Direction not yet defined.'"}",
  "gapSummary": "2–3 sentences. If aspirations were given: what's the gap between what the outfits currently say and what they've told us they want to say? Attribute their goals explicitly. If no aspirations: describe what the signal pattern shows and what's currently unclear or missing — without inventing a destination.",
  "signalGaps": [
    { "axis": "socialCategory", "current": 5.5, "target": 7.5, "direction": "up", "note": "One plain sentence. What does this gap mean in practical terms — what does the room read now versus what they want it to read? Only include if there is a real gap (>1 point)." }
  ],
  "adjustments": [
    { "title": "Plain, direct title — not motivational", "description": "One specific observation about what would shift this signal. Not a styling instruction. What would change and what would it change about how they land?", "axis": "socialCategory" },
    { "title": "...", "description": "...", "axis": "status" },
    { "title": "...", "description": "...", "axis": "aestheticCoherence" }
  ],
  "closingNote": "1–2 sentences. What makes this gap hard to see alone — and what would shift if it closed? Honest, not salesy."
}

Only include signalGaps where the difference is meaningful (>1 point). If aspirations are absent, signalGaps can note where the current signal is weakest or most ambiguous — not where it falls short of an assumed target.`;
};

// ─── CONSEQUENCE LAYER PROMPT ─────────────────────────────────────────────────
// For each signal gap, generate a consequence statement that names a specific 
// professional outcome, uses observational language, and draws distinctions 
// between similar-sounding roles.
const buildConsequenceLayerSystem = (gaps, aspirations) => {
  const gapDescriptions = gaps?.map((g, i) => 
    `Gap ${i+1}: ${g.axis} (current: ${g.current}, target: ${g.target}). Note: ${g.note}`
  ).join("\n") || "No gaps identified.";

  return `You are generating consequence statements for a professional's signal gaps. For each gap, you will name a specific professional outcome that may be affected, and draw a distinction between two roles that sound similar but aren't.

Your job is NOT to alarm or motivate — it's to name what's at stake, honestly and precisely, from the perspective of someone observing a room.

TONE: Like an experienced executive coach observing something useful and uncomfortable, from a position of genuine respect. Observational, not critical. Intelligent, precise, professionally consequential.

FOR EACH SIGNAL GAP:
1. Name a specific professional outcome that may be affected
   Examples: leadership assumption, strategic authority, promotion potential, room access, 
   who gets listened to first, whether you're read as executing vs. defining, 
   reviewing vs. deciding, contributing vs. leading

2. Use observational language, never critical
   Use: "may", "the room may", "people may assume"
   Never use: "you are", "you will", direct address

3. Draw a distinction between two roles that sound similar but aren't
   Examples: "Executing well vs. being asked to define strategy"
             "Solving problems vs. choosing which problems matter"
             "Being heard in meetings vs. being listened to first"

4. Never reference clothing, appearance, or style
   Always reference perception, signal, and professional consequence

5. End with one open question or observation that the full report answers
   Something that cannot be fully explained in a card — something that creates curiosity

CRITICAL RULES:
— Avoid: fear, urgency, negativity, fashion language, personal critique
— Aim for: professional consequence, useful specificity, respect

SIGNAL GAPS TO ADDRESS:
${gapDescriptions}

${aspirations ? `THEIR STATED ASPIRATIONS: ${aspirations.archetype || "Not specified"} in ${aspirations.context || "not specified"} context. Word: "${aspirations.word || 'not specified'}"` : "No aspirations stated — address the current gaps in observable outcomes."}

Return ONLY valid JSON:
{
  "consequences": [
    {
      "gap": "axis name (e.g., 'socialCategory')",
      "outcome": "A specific professional outcome: one phrase naming what's at stake (e.g., 'Room access and strategic input')",
      "distinction": "Two roles that sound similar but aren't, drawn from this gap (e.g., 'Being heard as someone solving problems vs. being consulted on which problems matter')",
      "observation": "One observational sentence using 'may': what might a room assume or do based on the current signal? (e.g., 'The room may see you as highly capable at execution, but less certain about your strategic thinking.')",
      "openingQuestion": "One question that the full report will answer but the card cannot fully address (e.g., 'What would it take for this room to ask your opinion on what matters, not just how to solve it?')"
    }
  ]
}`;
};

// ─── DEEP REPORT PROMPT ───────────────────────────────────────────────────────
// Revised framework: Professional perception analyst with behavioural psychology 
// precision and executive coach communication style.
// Structure: Headline → Room Reading → Signal Gap → Professional Meaning → Cost → 
// Predictive Insight → Next Signal → Close
const buildDeepReportSystem = (snaps, aspirations, probeAnswers) => {
  const snapSummary = snaps.map((s, i) => {
    const items = s.itemsDetected?.length ? `Items seen: ${s.itemsDetected.join(", ")}.` : "";
    return `Outfit ${i+1}: socialCategory=${s.signals?.socialCategory}/10, cognitiveState=${s.signals?.cognitiveState}/10, status=${s.signals?.status}/10, aestheticCoherence=${s.signals?.aestheticCoherence}/10. Tags: ${s.signalTags?.join(", ")}. ${items} Read: "${s.read}"`;
  }).join("\n");
  const avg = avgSignalsFrom(snaps);

  const allTags = snaps.flatMap(s => s.signalTags || []);
  const tagFreq = allTags.reduce((acc, t) => { acc[t] = (acc[t]||0)+1; return acc; }, {});
  const dominantTags = Object.entries(tagFreq).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t])=>t);

  return `You are a professional perception analyst with the observational precision of a behavioural psychologist and the communication style of a senior executive coach.

You are NOT a stylist. You are NOT a fashion advisor. You do NOT comment on clothing choices, style preferences, or appearance in evaluative terms.

You analyse what professional appearance SIGNALS — and what those signals may be causing others to assume before the person speaks.

YOUR ROLE:
Analyse the gap between how someone describes themselves professionally and what their appearance signals to a room. Your job is to be honest, specific, and useful — not to define them, not to prescribe solutions, and not to assume anything they haven't told you.

TONE: Like an experienced executive coach observing something useful and uncomfortable, from a position of genuine respect. Intelligent, observational, honest, respectful. Not harsh. Not flattering. Not neutral. The user should occasionally think: "That's probably true."

CRITICAL RULES — Non-negotiable:
— Never say: clothes, outfit, style, fashion, wardrobe, look, dress
— Always say: signal, appearance, perception, impression, reading, projection
— Quote their actual words from Q1–Q3 at least twice. Put quotes around exact words.
— Reference specific numerical scores or dominant tags at least three times.
— When referencing what they said, always attribute it: "They described themselves as..." or "They said..."
— Use observational language: "may", "the room may", "people may assume"
— Leave the gap open at the end — unresolved tension is what creates desire to resolve it properly.
— Do NOT soften findings with reassurance
— Do NOT prescribe what they should do
— Do NOT define their professional identity for them

OUTFIT SIGNAL DATA — ${snaps.length} reads:
${snapSummary}

AVERAGE SCORES: socialCategory=${avg?.socialCategory}/10, cognitiveState=${avg?.cognitiveState}/10, status=${avg?.status}/10, aestheticCoherence=${avg?.aestheticCoherence}/10
DOMINANT SIGNALS ACROSS ALL READS: ${dominantTags.join(", ")}

WHAT THEY'VE TOLD US:
Q1. Three words for how they show up professionally: "${probeAnswers?.threeWords || "—"}"
Q2. What they want people to remember after meeting them: "${probeAnswers?.knownFor || "—"}"
Q3. How a colleague would introduce them: "${probeAnswers?.introduction || "—"}"
Q4. How intentional they are about how they appear: "${probeAnswers?.intention || "—"}"
Q5. How well they think their perception matches their intention: "${probeAnswers?.match || "—"}"

THEIR ASPIRATIONS:
They want to project: ${aspirations?.archetype || "not stated"}
Priority context: ${aspirations?.context || "not stated"}
Word they want to own: "${aspirations?.word || "not stated"}"

GENERATE THESE EIGHT SECTIONS:

1. HEADLINE INSIGHT
One sentence. The central truth this person's signal pattern reveals. Should feel precise, slightly uncomfortable, and professionally specific. This is the report's thesis. Reference their exact words and at least one score.

2. WHAT THE ROOM IS READING
What signals are being picked up. Write as pattern recognition, not description. Help them see themselves from the outside. Use their dominant tags. Reference specific scores. This should feel like an outside observer's honest read.

3. THE SIGNAL GAP
Where intent and perception diverge. Name both sides explicitly. Name the distance without dramatising it. Quote what they said about themselves (Q1, Q2, or Q3). Place that next to what the scores and tags actually show. Professional, not personal.

4. WHAT THIS MAY MEAN PROFESSIONALLY
Connect the signal gap to real professional consequences. Use observational language ("may", "the room may", "people may assume"). Draw on: leadership assumptions, authority sequencing, room access, influence patterns, promotion signals, who gets listened to first. Be specific. Reference the context they mentioned or professional rooms generally.

5. WHAT THIS MAY BE COSTING YOU
Two to four short, direct statements. Name the hidden professional cost of the perception gap. Examples: being consulted but not deferred to. Being trusted but not followed. Having ideas accepted but not championed. Work with their specific data and aspirations.

6. THE PREDICTIVE OBSERVATION
One or two sentences beginning "This may explain why..." Connect the appearance pattern to a lived professional experience they will recognise. Reference their Q2 answer (what they want to be known for) or their aspirations. This is where the report earns credibility by naming something they've actually felt.

7. WHAT THE NEXT SIGNAL REQUIRES
What the next stage of their career tends to require from a perception standpoint. Never prescriptive. Never about appearance choices. Always about professional perception requirements. If their aspirations named a specific archetype or context, address what perception work would unlock that.

8. THE CLOSE
End with exactly: "The challenge is no longer understanding what the room sees. The challenge is deciding what the room should see instead."
Precede it with one sentence that acknowledges their gap specifically — reference their exact words or a specific score that matters.

Return ONLY valid JSON — no preamble, no markdown:
{
  "headlineInsight": "One sentence naming the central truth. Must reference their specific words from Q1–Q3 and at least one score.",
  "whatTheRoomIsReading": "2–3 sentences. Pattern recognition from their dominant tags and scores. Help them see themselves from the outside.",
  "theSignalGap": "2–3 sentences. Quote what they said. Name what the signals show. Name the distance.",
  "whatThisMayMeanProfessionally": "2–3 sentences. Professional consequences. Use 'may', 'the room may'. Reference leadership assumptions, authority, room access, influence, promotion signals.",
  "whatThisMayBeCostingYou": "2–4 short statements. Hidden professional costs of the gap. Specific to their data.",
  "thePredictiveObservation": "1–2 sentences beginning 'This may explain why...' Connect to a lived professional experience they'll recognise.",
  "whatTheNextSignalRequires": "2 sentences. Perception requirements for their next career stage. Never prescriptive. Never about appearance choices.",
  "theClose": "One sentence specific to their gap, then: 'The challenge is no longer understanding what the room sees. The challenge is deciding what the room should see instead.'"
}`;
};

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ width:24, height:24, borderRadius:"50%", border:"1.5px solid var(--teal)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--teal)" }} />
      </div>
      <span style={{ fontFamily:"var(--serif)", fontSize:20, fontWeight:500, letterSpacing:"0.04em" }}>Signl</span>
    </div>
  );
}

function Spinner({ size=16 }) {
  return <div style={{ width:size, height:size, border:"1.5px solid var(--border)", borderTopColor:"var(--teal)", borderRadius:"50%", animation:"spin 0.8s linear infinite", flexShrink:0 }} />;
}

function Cap({ children, style={} }) {
  return <p style={{ fontSize:10, letterSpacing:"0.2em", textTransform:"uppercase", color:"var(--teal)", fontFamily:"var(--sans)", fontWeight:500, ...style }}>{children}</p>;
}

function SignalBar({ left, right, value, color="var(--teal)", target=null }) {
  const pct  = ((value - 1) / 9) * 100;
  const tpct = target != null ? ((target - 1) / 9) * 100 : null;
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
        <span style={{ fontSize:10, color:"var(--muted)", letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:400 }}>{left}</span>
        <span style={{ fontSize:10, color:"var(--muted)", letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:400 }}>{right}</span>
      </div>
      <div style={{ position:"relative", height:2, background:"var(--border)", borderRadius:2 }}>
        {tpct != null && (
          <div style={{ position:"absolute", left:`${tpct}%`, transform:"translateX(-50%)", top:-4.5, width:11, height:11, borderRadius:"50%", background:"transparent", border:`1.5px dashed ${color}`, opacity:0.55 }} />
        )}
        <div style={{ position:"absolute", left:`${pct}%`, transform:"translateX(-50%)", top:-4.5, width:11, height:11, borderRadius:"50%", background:color, border:"2px solid var(--bg)", transition:"left 0.6s cubic-bezier(0.34,1.56,0.64,1)", boxShadow:`0 0 0 3px ${color}22` }} />
        <div style={{ position:"absolute", left:"50%", width:1, height:11, background:"var(--border)", top:-4.5, transform:"translateX(-50%)" }} />
      </div>
    </div>
  );
}

function SignalRadar({ signals, targetSignals=null, compact=false }) {
  if (!signals) return null;
  const { socialCategory=5, cognitiveState=5, status=5, aestheticCoherence=5 } = signals;
  return (
    <div style={{ padding:compact?"12px 16px":"18px 20px", background:"white", border:"1px solid var(--border)" }}>
      {!compact && <Cap style={{ marginBottom:14, color:"var(--muted)" }}>Signal Reading</Cap>}
      <SignalBar left="Ambiguous Tribe" right="Legible Archetype" value={socialCategory} color="var(--teal)" target={targetSignals?.socialCategory} />
      <SignalBar left="Context Misread" right="Context Aligned" value={cognitiveState} color="var(--green)" target={targetSignals?.cognitiveState} />
      <SignalBar left="Status Neutral" right="Status Projected" value={status} color="var(--amber)" target={targetSignals?.status} />
      <SignalBar left="Incoherent" right="Considered" value={aestheticCoherence} color="var(--mauve)" target={targetSignals?.aestheticCoherence} />
      {targetSignals && <p style={{ fontSize:10, color:"var(--muted)", marginTop:6, fontStyle:"italic" }}>Solid = current · Dashed = aspired</p>}
    </div>
  );
}

function SignalTag({ tag, small=false }) {
  return (
    <span style={{ fontSize:small?9:10, color:"var(--teal)", border:"1px solid rgba(29,158,117,0.25)", padding:small?"2px 8px":"3px 10px", letterSpacing:"0.1em", fontWeight:500, display:"inline-block", whiteSpace:"nowrap" }}>
      {tag}
    </span>
  );
}

function SnapProgress({ count, required }) {
  return (
    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
      {Array.from({ length:required }).map((_, i) => (
        <div key={i} style={{ width:i<count?20:6, height:6, borderRadius:3, background:i<count?"var(--teal)":"var(--border)", transition:"all 0.4s ease" }} />
      ))}
      <span style={{ fontSize:10, color:"var(--muted)", marginLeft:4, letterSpacing:"0.1em", fontWeight:300 }}>{count}/{required}</span>
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav({ screen, setScreen, snapCount, personaReady, reportReady }) {
  const tabs = [
    { id:SCREENS.HOME,    label:"Audit" },
    { id:SCREENS.SIGNALS, label:"My Signals", dot:personaReady },
    { id:SCREENS.REPORT,  label:"Report",     dot:reportReady, locked:snapCount < SNAPS_REQUIRED },
  ];
  return (
    <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, background:"rgba(248,247,245,0.95)", backdropFilter:"blur(10px)", borderBottom:"1px solid var(--border)", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", paddingLeft:16, paddingRight:16 }}>
      <Logo />
      <div style={{ display:"flex", alignItems:"center" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => !t.locked && setScreen(t.id)}
            style={{ background:"none", border:"none", fontFamily:"var(--sans)", fontSize:11, fontWeight:screen===t.id?500:300, letterSpacing:"0.11em", textTransform:"uppercase", padding:"8px 10px", cursor:t.locked?"default":"pointer", color:t.locked?"rgba(118,116,112,0.35)":screen===t.id?"var(--ink)":"var(--muted)", borderBottom:screen===t.id?"1.5px solid var(--ink)":"1.5px solid transparent", transition:"all 0.18s", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5 }}>
            {t.label}
            {t.locked && <span style={{ fontSize:8, opacity:0.4 }}>○</span>}
            {t.dot && !t.locked && <span style={{ width:4, height:4, borderRadius:"50%", background:"var(--teal)", display:"inline-block", animation:"pulse 2.5s ease infinite" }} />}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─── Aspiration Modal ─────────────────────────────────────────────────────────
function AspirationModal({ onSave }) {
  const [archetype, setArchetype] = useState("");
  const [context,   setContext]   = useState("");
  const [word,      setWord]      = useState("");
  const ready = archetype && context && word.trim();

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(20,20,18,0.65)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeIn 0.3s ease" }}>
      <div style={{ background:"var(--bg)", border:"1.5px solid var(--bstrong)", maxWidth:540, width:"100%", maxHeight:"92vh", overflow:"auto", animation:"slideUp 0.3s ease both" }}>
        <div style={{ padding:"28px 28px 0" }}>
          <Cap style={{ marginBottom:10 }}>Before your next snap</Cap>
          <h2 style={{ fontFamily:"var(--serif)", fontSize:"clamp(24px,4vw,32px)", fontWeight:300, lineHeight:1.1, marginBottom:10 }}>
            What are you aiming to project?
          </h2>
          <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.75, fontWeight:300, marginBottom:28 }}>
            Three quick questions. Your answers become the target your signal pattern is measured against.
          </p>
        </div>

        <div style={{ padding:"0 28px 28px", display:"flex", flexDirection:"column", gap:26 }}>
          <div>
            <p style={{ fontFamily:"var(--serif)", fontSize:15, fontWeight:400, marginBottom:4 }}>What professional stance are you building toward?</p>
            <p style={{ fontSize:11, color:"var(--muted)", fontWeight:300, marginBottom:12 }}>The position you want to be recognised as occupying.</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {ARCHETYPES.map(a => (
                <button key={a} onClick={() => setArchetype(a)}
                  style={{ background:archetype===a?"var(--teal-bg)":"white", border:`1.5px solid ${archetype===a?"var(--teal)":"var(--border)"}`, color:archetype===a?"var(--teal)":"var(--muted)", fontFamily:"var(--sans)", fontSize:12, fontWeight:archetype===a?500:300, letterSpacing:"0.08em", padding:"9px 18px", cursor:"pointer", transition:"all 0.15s" }}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontFamily:"var(--serif)", fontSize:15, fontWeight:400, marginBottom:4 }}>Where does this matter most?</p>
            <p style={{ fontSize:11, color:"var(--muted)", fontWeight:300, marginBottom:12 }}>The context you most need to land in.</p>
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              {CONTEXTS.map(c => (
                <button key={c} onClick={() => setContext(c)}
                  style={{ background:context===c?"var(--teal-bg)":"white", border:`1.5px solid ${context===c?"var(--teal)":"var(--border)"}`, borderLeft:`3px solid ${context===c?"var(--teal)":"var(--border)"}`, color:context===c?"var(--ink)":"var(--muted)", fontFamily:"var(--sans)", fontSize:12, fontWeight:context===c?400:300, letterSpacing:"0.04em", padding:"11px 16px", cursor:"pointer", transition:"all 0.15s", textAlign:"left" }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontFamily:"var(--serif)", fontSize:15, fontWeight:400, marginBottom:4 }}>In one word — what do you want people to feel after meeting you?</p>
            <p style={{ fontSize:11, color:"var(--muted)", fontWeight:300, marginBottom:12 }}>Not a word for you — a feeling in them. Assured. Challenged. Trusted. Inspired.</p>
            <input value={word} onChange={e => setWord(e.target.value)} placeholder="e.g. Trusted" maxLength={30}
              style={{ width:"100%", background:"white", border:"1.5px solid var(--border)", borderLeft:"3px solid var(--teal)", color:"var(--ink)", fontFamily:"var(--serif)", fontSize:18, fontWeight:300, fontStyle:"italic", padding:"12px 16px", outline:"none" }} />
          </div>

          <button onClick={() => ready && onSave({ archetype, context, word:word.trim() })} disabled={!ready}
            style={{ background:ready?"var(--ink)":"transparent", border:`1.5px solid ${ready?"var(--ink)":"var(--border)"}`, color:ready?"var(--bg)":"var(--muted)", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"14px", cursor:ready?"pointer":"default", transition:"all 0.18s" }}>
            Set My Target →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HOME / AUDIT ─────────────────────────────────────────────────────────────
function HomeScreen({ snaps, setSnaps, setWardrobe, aspirations, setShowAspiration, setScreen }) {
  const [preview,      setPreview]      = useState(null);
  const [base64,       setBase64]       = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [result,       setResult]       = useState(null);
  const [cameraMode,   setCameraMode]   = useState(false);
  const [cameraError,  setCameraError]  = useState(null);
  const [status,       setStatus]       = useState(null);
  const [error,        setError]        = useState(null);
  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const streamRef     = useRef(null);
  const latest  = snaps[snaps.length - 1];
  const done    = snaps.length >= SNAPS_REQUIRED;
  const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

  const startCamera = async () => {
    setError(null);
    setCameraError(null);
    try {
      setStatus("Requesting camera access…");
      
      // Check if API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API not available. Your browser may not support camera access.");
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "user",
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        },
        audio: false,
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraMode(true);
      setStatus(null);
    } catch (err) {
      console.error('Camera error:', err.name, err.message);
      
      let msg = `Camera error: ${err.message}`;
      
      if (err.name === "NotAllowedError") {
        msg = "Camera permission denied. Open your browser settings and allow camera access for this site.";
      } else if (err.name === "NotFoundError") {
        msg = "No camera found on this device.";
      } else if (err.name === "NotReadableError") {
        msg = "Camera is already in use by another app. Please close it and try again.";
      } else if (err.name === "SecurityError") {
        msg = "Camera access requires HTTPS (secure connection). Reload the page and try again.";
      }
      
      setCameraError(msg);
      setStatus(null);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.85);
    setPreview(dataUrl);
    setBase64(dataUrl.split(",")[1]);
    stopCamera();
    setStatus(null);
    setError(null);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraMode(false);
    setCameraError(null);
  };

  const handleFile = f => {
    if (!f) return;
    setError(null);
    setStatus("Reading image…");
    
    // Validate file size
    if (f.size > MAX_FILE_SIZE) {
      setError(`Image is too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Please use an image under 8MB.`);
      setStatus(null);
      return;
    }

    const r = new FileReader();
    r.onload = e => {
      setStatus("Converting image…");
      try {
        const dataUrl = e.target.result;
        const b64 = dataUrl.split(",")[1];
        if (!b64) throw new Error("Failed to extract image data");
        setPreview(dataUrl);
        setBase64(b64);
        setResult(null);
        setStatus(null);
        setError(null);
      } catch (err) {
        setError(`Failed to process image: ${err.message}`);
        setStatus(null);
      }
    };
    r.onerror = () => {
      setError("Failed to read image file. Please try again.");
      setStatus(null);
    };
    r.readAsDataURL(f);
  };

  const analyse = async () => {
    if (!base64) return;
    setLoading(true);
    setError(null);
    try {
      setStatus("Sending to Claude…");
      const reply  = await callClaude([{ role:"user", content:"Analyse the professional signals in this outfit." }], SNAP_ANALYSIS_SYSTEM, base64);
      
      setStatus("Parsing response…");
      const parsed = parseJSON(reply);
      if (!parsed) {
        throw new Error("Claude returned invalid data. Please try again.");
      }

      setStatus("Saving snap…");
      const snap = {
        id:            Date.now().toString(),
        timestamp:     new Date().toISOString(),
        preview,
        signals:       parsed.signals,
        read:          parsed.read,
        contextFit:    parsed.contextFit,
        signalTags:    parsed.signalTags,
        itemsDetected: parsed.itemsDetected,
      };

      const newSnaps = [...snaps, snap];
      setSnaps(newSnaps);
      setResult(snap);

      if (parsed.itemsDetected?.length) {
        const newItems = parsed.itemsDetected.map((desc, i) => ({
          id:          `${snap.id}-${i}`,
          name:        desc,
          category:    inferCategory(desc),
          preview,
          description: desc,
          signals:     parsed.signals,
          signalTags:  parsed.signalTags,
          fromSnap:    snap.id,
        }));
        setWardrobe(prev => {
          const existing = new Set(prev.map(x => x.name.toLowerCase()));
          return [...prev, ...newItems.filter(x => !existing.has(x.name.toLowerCase()))];
        });
      }

      if (newSnaps.length === 1 && !aspirations) {
        setTimeout(() => setShowAspiration(true), 900);
      }
      setStatus(null);
    } catch(e) {
      console.error(e);
      setError(`Analysis failed: ${e.message}`);
      setStatus(null);
    }
    setLoading(false);
  };

  const reset = () => { setPreview(null); setBase64(null); setResult(null); setError(null); setStatus(null); };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div style={{ minHeight:"100vh", paddingTop:56 }}>
      <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--border)" }}>
        <div style={{ maxWidth:720, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:12 }}>
          <div>
            <Cap style={{ marginBottom:6 }}>Daily Presence Audit</Cap>
            <h2 style={{ fontFamily:"var(--serif)", fontSize:"clamp(22px,4vw,32px)", fontWeight:300, lineHeight:1.1 }}>
              {done ? "Signal history complete" : "What are you projecting today?"}
            </h2>
          </div>
          <SnapProgress count={snaps.length} required={SNAPS_REQUIRED} />
        </div>
      </div>

      <div style={{ maxWidth:720, margin:"0 auto", padding:"28px 24px" }}>
        {done && !result ? (
          <div style={{ textAlign:"center", paddingTop:48, animation:"fadeUp 0.5s ease both" }}>
            <div style={{ width:64, height:64, borderRadius:"50%", border:"1.5px solid var(--green)", margin:"0 auto 24px", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ color:"var(--green)", fontSize:26 }}>✦</span>
            </div>
            <p style={{ fontFamily:"var(--serif)", fontSize:26, fontWeight:300, marginBottom:12 }}>Five snaps. Your report is ready.</p>
            <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.8, fontWeight:300, maxWidth:380, margin:"0 auto 32px" }}>
              Your signal pattern has been captured. The gap between what you currently project and what you're aiming for is now visible.
            </p>
            <button onClick={() => setScreen(SCREENS.REPORT)}
              style={{ background:"var(--ink)", color:"var(--bg)", border:"none", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"14px 36px", cursor:"pointer" }}>
              View My Report →
            </button>
            <div style={{ marginTop:20 }}>
              <button onClick={reset} style={{ background:"none", border:"none", color:"var(--muted)", fontFamily:"var(--sans)", fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer" }}>
                + Snap another
              </button>
            </div>
          </div>

        ) : cameraMode ? (
          <div style={{ animation:"fadeUp 0.4s ease both" }}>
            <div style={{ background:"white", border:"1.5px solid var(--bstrong)", overflow:"hidden", marginBottom:14 }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width:"100%", height:"auto", display:"block" }}
              />
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={capturePhoto}
                style={{ background:"var(--ink)", color:"var(--bg)", border:"none", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"13px 32px", cursor:"pointer" }}>
                📸 Capture
              </button>
              <button onClick={stopCamera}
                style={{ background:"none", border:"1.5px solid var(--border)", color:"var(--muted)", fontFamily:"var(--sans)", fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", padding:"13px 20px", cursor:"pointer" }}>
                Cancel
              </button>
            </div>
          </div>

        ) : !result ? (
          <div style={{ animation:"fadeUp 0.4s ease both" }}>
            {/* Error box */}
            {error && (
              <div style={{ marginBottom:16, padding:"16px 18px", background:"rgba(176,106,32,0.08)", border:"1.5px solid rgba(176,106,32,0.2)", borderRadius:2 }}>
                <p style={{ fontSize:12, color:"var(--amber)", fontWeight:400, lineHeight:1.6 }}>⚠ {error}</p>
              </div>
            )}

            {/* Status message */}
            {status && (
              <div style={{ marginBottom:16, padding:"14px 16px", background:"var(--teal-bg)", border:"1px solid rgba(29,158,117,0.2)", display:"flex", gap:10, alignItems:"center" }}>
                <div style={{ width:3, height:3, borderRadius:"50%", background:"var(--teal)", animation:"pulse 1.2s ease infinite" }} />
                <p style={{ fontSize:12, color:"var(--teal)", fontWeight:400 }}>{status}</p>
              </div>
            )}

            <div
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
              onDragOver={e => e.preventDefault()}
              style={{ border:`1.5px dashed ${preview?"var(--teal)":"var(--bstrong)"}`, minHeight:320, display:"flex", alignItems:"center", justifyContent:"center", background:"white", overflow:"hidden", transition:"border-color 0.2s", position:"relative" }}
            >
              {preview ? (
                <>
                  <img src={preview} alt="" style={{ width:"100%", maxHeight:420, objectFit:"contain" }} />
                  {loading && (
                    <div style={{ position:"absolute", inset:0, background:"rgba(248,247,245,0.88)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
                      <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
                        <div style={{ position:"absolute", left:0, right:0, height:2, background:"linear-gradient(90deg, transparent, var(--teal), transparent)", opacity:0.6, animation:"scanline 1.8s linear infinite" }} />
                      </div>
                      <Spinner size={20} />
                      <p style={{ fontSize:11, letterSpacing:"0.18em", textTransform:"uppercase", color:"var(--teal)", fontWeight:400 }}>Reading signals…</p>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign:"center", padding:40, pointerEvents:"none" }}>
                  <div style={{ width:60, height:60, borderRadius:"50%", border:"1.5px solid var(--bstrong)", margin:"0 auto 20px", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", border:"1.5px solid var(--teal-lt)" }} />
                  </div>
                  <p style={{ fontFamily:"var(--serif)", fontSize:20, marginBottom:8, fontWeight:300 }}>Photograph your outfit</p>
                  <p style={{ fontSize:12, color:"var(--muted)", fontWeight:300, lineHeight:1.7 }}>Drop an image, or use the buttons below.<br />Full outfit gives the sharpest read.</p>
                  {aspirations && (
                    <div style={{ marginTop:20, padding:"10px 18px", background:"var(--teal-bg)", border:"1px solid rgba(29,158,117,0.15)", display:"inline-flex", gap:12, alignItems:"center" }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--teal)", display:"inline-block", animation:"pulse 2.5s ease infinite" }} />
                      <p style={{ fontSize:11, color:"var(--teal)", fontWeight:400 }}>Target: {aspirations.archetype} · "{aspirations.word}"</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <input id="read-file-input" type="file" accept="image/*" style={{ display:"none" }} onChange={e => { handleFile(e.target.files[0]); e.target.value=""; }} />

            {!preview ? (
              <div style={{ display:"flex", gap:10, marginTop:14 }}>
                <label htmlFor="read-file-input" style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:"var(--ink)", color:"var(--bg)", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"13px", cursor:"pointer", userSelect:"none" }}>
                  📁 Upload Photo
                </label>
                {navigator.mediaDevices?.getUserMedia && (
                  <button onClick={startCamera}
                    style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:"var(--ink)", color:"var(--bg)", border:"none", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"13px", cursor:"pointer" }}>
                    📷 Open Camera
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14 }}>
                <button onClick={reset} style={{ background:"none", border:"none", color:"var(--muted)", fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer", fontFamily:"var(--sans)" }}>✕ Remove</button>
                <button onClick={analyse} disabled={!base64||loading}
                  style={{ background:base64&&!loading?"var(--ink)":"transparent", border:`1.5px solid ${base64&&!loading?"var(--ink)":"var(--border)"}`, color:base64&&!loading?"var(--bg)":"var(--muted)", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"13px 32px", cursor:base64&&!loading?"pointer":"default", display:"flex", alignItems:"center", gap:10, transition:"all 0.18s" }}>
                  {loading ? <><Spinner size={13} /><span>Reading signals…</span></> : "Read My Signals"}
                </button>
              </div>
            )}

            {cameraError && (
              <div style={{ marginTop:16, padding:"14px 16px", background:"rgba(176,106,32,0.08)", border:"1.5px solid rgba(176,106,32,0.2)", borderRadius:2 }}>
                <p style={{ fontSize:12, color:"var(--amber)", fontWeight:400, lineHeight:1.6 }}>⚠ {cameraError}</p>
              </div>
            )}

            {!preview && latest && (
              <div style={{ marginTop:36, animation:"fadeUp 0.5s ease 0.15s both" }}>
                <Cap style={{ marginBottom:12, color:"var(--muted)" }}>Last reading</Cap>
                <div style={{ display:"flex", flexDirection:"column", border:"1px solid var(--border)", background:"white", overflow:"hidden" }}>
                  <img src={latest.preview} alt="" style={{ width:"100%", height:"auto", objectFit:"cover", minHeight:160, display:"block" }} />
                  <div style={{ padding:"14px 16px" }}>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                      {latest.signalTags?.map((t,i) => <SignalTag key={i} tag={t} small />)}
                    </div>
                    <p style={{ fontSize:12, color:"var(--muted)", lineHeight:1.7, fontWeight:300, fontStyle:"italic" }}>{latest.read?.slice(0,120)}…</p>
                  </div>
                </div>
              </div>
            )}
          </div>

        ) : (
          <div style={{ animation:"fadeUp 0.5s ease both" }}>
            <div style={{ display:"flex", flexDirection:"column", border:"1.5px solid var(--bstrong)", borderTop:"3px solid var(--teal)", background:"white", overflow:"hidden", marginBottom:12 }}>
              <div style={{ width:"100%", height:"auto" }}>
                <img src={result.preview} alt="" style={{ width:"100%", height:"auto", objectFit:"cover", minHeight:240, display:"block" }} />
              </div>
              <div style={{ padding:"22px 24px" }}>
                <Cap style={{ marginBottom:10 }}>Snap {snaps.length} of {SNAPS_REQUIRED}</Cap>
                <p style={{ fontFamily:"var(--serif)", fontSize:15, lineHeight:1.85, fontWeight:300, fontStyle:"italic", marginBottom:14 }}>{result.read}</p>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {result.signalTags?.map((t,i) => <SignalTag key={i} tag={t} />)}
                </div>
              </div>
            </div>

            <SignalRadar signals={result.signals} />

            {result.contextFit && (
              <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:2, marginBottom:14 }}>
                {Object.entries(result.contextFit).map(([ctx, fit], i) => (
                  <div key={i} style={{ padding:"12px 14px", background:"white", border:"1px solid var(--border)", textAlign:"center" }}>
                    <p style={{ fontSize:9, color:"var(--muted)", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 }}>{ctx.replace(/([A-Z])/g," $1").trim()}</p>
                    <p style={{ fontSize:12, fontWeight:500, color:fit==="Strong"?"var(--green)":fit==="Limited"?"var(--teal)":"var(--muted)" }}>{fit}</p>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={reset} style={{ flex:1, background:"var(--ink)", color:"var(--bg)", border:"none", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.14em", textTransform:"uppercase", padding:"13px", cursor:"pointer" }}>
                {done ? "All Done" : "Next Snap"}
              </button>
              {done ? (
                <button onClick={() => setScreen(SCREENS.REPORT)} style={{ flex:1, background:"none", border:"1px solid var(--bstrong)", color:"var(--ink)", fontFamily:"var(--sans)", fontSize:11, letterSpacing:"0.14em", textTransform:"uppercase", padding:"13px", cursor:"pointer" }}>
                  View Report →
                </button>
              ) : (
                <button onClick={() => setScreen(SCREENS.SIGNALS)} style={{ flex:1, background:"none", border:"1px solid var(--bstrong)", color:"var(--ink)", fontFamily:"var(--sans)", fontSize:11, letterSpacing:"0.14em", textTransform:"uppercase", padding:"13px", cursor:"pointer" }}>
                  View Signals →
                </button>
              )}
            </div>
            {done && <p style={{ fontSize:11, color:"var(--green)", textAlign:"center", marginTop:10, fontWeight:400 }}>✦ Your report is ready</p>}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} style={{ display:"none" }} />
    </div>
  );
}

// ─── SIGNALS SCREEN ───────────────────────────────────────────────────────────
function SignalsScreen({ snaps, persona, setPersona }) {
  const [synthesising, setSynthesising] = useState(false);
  const avg   = avgSignalsFrom(snaps);
  const ready = snaps.length >= MIN_FOR_PERSONA;

  const synthesise = async () => {
    setSynthesising(true);
    try {
      const reply  = await callClaude([{ role:"user", content:"Synthesise my Brand Persona." }], buildPersonaSynthesisSystem(snaps), null, 1000);
      const parsed = parseJSON(reply);
      setPersona(parsed || { headline:"Unable to synthesise", summary:"Please try again.", dominantSignals:[] });
    } catch { setPersona({ headline:"Error", summary:"Unable to synthesise — please try again.", dominantSignals:[] }); }
    setSynthesising(false);
  };

  return (
    <div style={{ minHeight:"100vh", paddingTop:56 }}>
      <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--border)" }}>
        <div style={{ maxWidth:680, margin:"0 auto" }}>
          <Cap style={{ marginBottom:6 }}>Signal Profile</Cap>
          <h2 style={{ fontFamily:"var(--serif)", fontSize:"clamp(22px,4vw,32px)", fontWeight:300, lineHeight:1.1 }}>
            {persona ? persona.headline : "Building your profile"}
          </h2>
          {snaps.length>0 && (
            <div style={{ marginTop:14 }}>
              <div style={{ height:2, background:"var(--border)", borderRadius:1 }}>
                <div style={{ height:"100%", width:`${Math.min(snaps.length/SNAPS_REQUIRED,1)*100}%`, background:snaps.length>=SNAPS_REQUIRED?"var(--green)":"var(--teal)", borderRadius:1, transition:"width 0.6s ease" }} />
              </div>
              <p style={{ fontSize:11, color:"var(--muted)", marginTop:6, fontWeight:300 }}>
                {snaps.length} of {SNAPS_REQUIRED} snaps · {snaps.length>=SNAPS_REQUIRED?"Complete":"Building signal pattern"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth:680, margin:"0 auto", padding:"24px" }}>
        {snaps.length === 0 ? (
          <div style={{ textAlign:"center", paddingTop:80, animation:"fadeUp 0.5s ease both" }}>
            <p style={{ fontFamily:"var(--serif)", fontSize:20, fontWeight:300, marginBottom:10 }}>No signals yet</p>
            <p style={{ fontSize:13, color:"var(--muted)", fontWeight:300 }}>Snap your first outfit on the Audit tab to begin.</p>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {avg && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <Cap style={{ color:"var(--muted)" }}>Average signal pattern</Cap>
                  <span style={{ fontSize:10, color:"var(--muted)", fontWeight:300 }}>{snaps.length} snap{snaps.length!==1?"s":""}</span>
                </div>
                <SignalRadar signals={avg} />
              </div>
            )}

            {persona ? (
              <div style={{ padding:"24px", background:"white", border:"1.5px solid var(--bstrong)", borderTop:"3px solid var(--teal)", animation:"pop 0.5s ease both" }}>
                <Cap style={{ marginBottom:12 }}>Emerging Persona</Cap>
                <h3 style={{ fontFamily:"var(--serif)", fontSize:22, fontWeight:300, marginBottom:14 }}>{persona.headline}</h3>
                <p style={{ fontSize:13, lineHeight:1.85, fontWeight:300, color:"var(--muted)", fontStyle:"italic", marginBottom:16 }}>{persona.summary}</p>
                {persona.dominantSignals?.length>0 && (
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
                    {persona.dominantSignals.map((s,i) => <SignalTag key={i} tag={s} />)}
                  </div>
                )}
                {persona.strongestContext && (
                  <div style={{ padding:"12px 16px", background:"var(--surface)", borderLeft:"3px solid var(--teal)", marginBottom:10 }}>
                    <Cap style={{ marginBottom:4, fontSize:9, color:"var(--muted)" }}>Strongest context</Cap>
                    <p style={{ fontSize:13, fontWeight:300 }}>{persona.strongestContext}</p>
                  </div>
                )}
                {persona.gapOpportunity && (
                  <div style={{ padding:"12px 16px", background:"var(--teal-bg)", borderLeft:"3px solid var(--teal-lt)" }}>
                    <Cap style={{ marginBottom:4, fontSize:9, color:"var(--teal-lt)" }}>Signal observation</Cap>
                    <p style={{ fontSize:13, fontWeight:300 }}>{persona.gapOpportunity}</p>
                  </div>
                )}
                {persona.evolution && (
                  <p style={{ fontSize:11, color:"var(--muted)", marginTop:16, fontStyle:"italic", fontWeight:300 }}>{persona.evolution}</p>
                )}
                <button onClick={() => setPersona(null)} style={{ marginTop:16, background:"none", border:"none", color:"var(--muted)", fontFamily:"var(--sans)", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", cursor:"pointer" }}>Regenerate</button>
              </div>
            ) : ready ? (
              <button onClick={synthesise} disabled={synthesising}
                style={{ background:synthesising?"transparent":"var(--ink)", border:`1.5px solid ${synthesising?"var(--border)":"var(--ink)"}`, color:synthesising?"var(--muted)":"var(--bg)", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"16px", cursor:synthesising?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
                {synthesising ? <><Spinner size={14} /><span>Synthesising…</span></> : "✦ Synthesise My Persona"}
              </button>
            ) : (
              <div style={{ padding:"16px 20px", background:"var(--surface)", border:"1px solid var(--border)" }}>
                <p style={{ fontSize:13, color:"var(--muted)", fontWeight:300 }}>
                  Persona synthesis available after {MIN_FOR_PERSONA - snaps.length} more snap{MIN_FOR_PERSONA-snaps.length!==1?"s":""}.
                </p>
              </div>
            )}

            <div>
              <Cap style={{ marginBottom:12, color:"var(--muted)" }}>Signal history</Cap>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(110px,1fr))", gap:2 }}>
                {snaps.map((snap,i) => (
                  <div key={snap.id} style={{ background:"white", border:"1px solid var(--border)", overflow:"hidden" }}>
                    <div style={{ aspectRatio:"3/4", position:"relative" }}>
                      <img src={snap.preview} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                      <div style={{ position:"absolute", top:6, left:6, background:"rgba(20,20,18,0.65)", color:"white", fontSize:8, letterSpacing:"0.1em", padding:"2px 7px" }}>#{i+1}</div>
                    </div>
                    <div style={{ padding:"8px 10px", borderTop:"1px solid var(--border)" }}>
                      <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                        {snap.signalTags?.slice(0,2).map((t,j) => (
                          <span key={j} style={{ fontSize:8, color:"var(--teal)", border:"1px solid rgba(29,158,117,0.2)", padding:"1px 5px", letterSpacing:"0.06em" }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SHARE CARD ───────────────────────────────────────────────────────────────
function ShareCard({ persona, avgSignals }) {
  if (!persona) return null;
  const bars = [
    { left:"Ambiguous Tribe",  right:"Legible Archetype", value:avgSignals?.socialCategory||5,     color:"var(--teal)" },
    { left:"Context Misread",  right:"Context Aligned",   value:avgSignals?.cognitiveState||5,     color:"var(--green)" },
    { left:"Status Neutral",   right:"Status Projected",  value:avgSignals?.status||5,             color:"var(--amber)" },
    { left:"Incoherent",       right:"Considered",        value:avgSignals?.aestheticCoherence||5, color:"var(--mauve)" },
  ];
  return (
    <div style={{ background:"var(--ink)", padding:"32px 28px", maxWidth:360, border:"1.5px solid var(--ink)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:26 }}>
        <div style={{ width:16, height:16, borderRadius:"50%", border:"1px solid var(--teal)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width:5, height:5, borderRadius:"50%", background:"var(--teal)" }} />
        </div>
        <span style={{ fontFamily:"var(--serif)", fontSize:13, fontWeight:400, letterSpacing:"0.06em", color:"rgba(248,247,245,0.55)" }}>Signl</span>
      </div>
      <p style={{ fontSize:9, letterSpacing:"0.2em", textTransform:"uppercase", color:"var(--teal)", fontFamily:"var(--sans)", fontWeight:500, marginBottom:10 }}>My Signal Profile</p>
      <h2 style={{ fontFamily:"var(--serif)", fontSize:"clamp(20px,4vw,28px)", fontWeight:300, lineHeight:1.1, color:"var(--bg)", marginBottom:22 }}>
        {persona.headline}
      </h2>
      {avgSignals && (
        <div style={{ marginBottom:20 }}>
          {bars.map((bar,i) => {
            const pct = ((bar.value - 1) / 9) * 100;
            return (
              <div key={i} style={{ marginBottom:13 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ fontSize:9, color:"rgba(248,247,245,0.35)", letterSpacing:"0.08em", textTransform:"uppercase" }}>{bar.left}</span>
                  <span style={{ fontSize:9, color:"rgba(248,247,245,0.35)", letterSpacing:"0.08em", textTransform:"uppercase" }}>{bar.right}</span>
                </div>
                <div style={{ position:"relative", height:1, background:"rgba(248,247,245,0.12)", borderRadius:1 }}>
                  <div style={{ position:"absolute", left:`${pct}%`, transform:"translateX(-50%)", top:-4, width:9, height:9, borderRadius:"50%", background:bar.color, border:"1.5px solid var(--ink)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {persona.dominantSignals?.length>0 && (
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:22 }}>
          {persona.dominantSignals.slice(0,3).map((s,i) => (
            <span key={i} style={{ fontSize:9, color:"var(--teal)", border:"1px solid rgba(29,158,117,0.4)", padding:"3px 9px", letterSpacing:"0.1em", fontWeight:500 }}>{s}</span>
          ))}
        </div>
      )}
      <div style={{ height:1, background:"rgba(248,247,245,0.1)", marginBottom:16 }} />
      <p style={{ fontSize:9, color:"rgba(248,247,245,0.25)", letterSpacing:"0.14em", textTransform:"uppercase", fontFamily:"var(--sans)" }}>Signl — by Dfine</p>
    </div>
  );
}

// ─── PROBE MODAL ──────────────────────────────────────────────────────────────
// Five questions designed not to gather data — but to surface lack of definition.
// The act of answering them is the diagnostic. Vague answers reveal an undefined brand.
const PROBE_QUESTIONS = [
  {
    key:         "threeWords",
    type:        "text",
    short:       true,
    question:    "In three words — how do you currently show up professionally?",
    sub:         "The first words that come. Don't curate them.",
    placeholder: "e.g. Calm, decisive, direct",
  },
  {
    key:         "knownFor",
    type:        "text",
    short:       false,
    question:    "What do you want people to remember after meeting you professionally?",
    sub:         "Not what you do. Who you are. This is harder than it sounds.",
    placeholder: "e.g. The person who makes complex things feel navigable",
  },
  {
    key:         "introduction",
    type:        "text",
    short:       false,
    question:    "If a senior colleague introduced you to someone important right now, what would they actually say?",
    sub:         "Write the realistic sentence — not the ideal one.",
    placeholder: "e.g. This is James, he leads our growth work — very results-focused…",
  },
  {
    key:      "intention",
    type:     "select",
    question: "When you dress for an important professional moment, how consciously do you think about what you're communicating?",
    sub:      null,
    options: [
      "Very consciously — I know exactly what I want to signal",
      "I have a general feel for it — more instinct than strategy",
      "I aim to look good and appropriate — the signalling is secondary",
      "Honestly, not very consciously — I haven't thought in those terms",
    ],
  },
  {
    key:      "match",
    type:     "select",
    question: "How well does your current professional image match the professional you're becoming?",
    sub:      null,
    options: [
      "It matches well — I show up as I intend",
      "Reasonably — though I know there's room to sharpen it",
      "There's a gap I can feel but haven't fully mapped",
      "I'm genuinely not sure — that's part of why I'm here",
    ],
  },
];

function ProbeModal({ onComplete, onClose }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ threeWords:"", knownFor:"", introduction:"", intention:"", match:"" });
  const q       = PROBE_QUESTIONS[step];
  const isLast  = step === PROBE_QUESTIONS.length - 1;
  const canNext = answers[q.key]?.trim().length > 0;

  const next = () => isLast ? onComplete(answers) : setStep(s => s + 1);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(20,20,18,0.75)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeIn 0.25s ease" }}>
      <div style={{ background:"var(--bg)", border:"1.5px solid var(--bstrong)", maxWidth:560, width:"100%", maxHeight:"92vh", overflow:"auto", animation:"slideUp 0.3s ease both" }}>

        {/* Header */}
        <div style={{ padding:"20px 28px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <Cap style={{ marginBottom:3 }}>Before your deep report</Cap>
            <p style={{ fontSize:11, color:"var(--muted)", fontWeight:300 }}>Question {step + 1} of {PROBE_QUESTIONS.length}</p>
          </div>
          <div style={{ display:"flex", gap:5, alignItems:"center" }}>
            {PROBE_QUESTIONS.map((_, i) => (
              <div key={i} style={{ height:4, borderRadius:2, background:i < step ? "var(--green)" : i === step ? "var(--teal)" : "var(--border)", width:i <= step ? 18 : 6, transition:"all 0.35s ease" }} />
            ))}
          </div>
        </div>

        {/* Question body */}
        <div style={{ padding:"36px 28px 28px" }} key={step}>
          <h2 style={{ fontFamily:"var(--serif)", fontSize:"clamp(19px,3.2vw,26px)", fontWeight:300, lineHeight:1.22, marginBottom:q.sub ? 12 : 26, animation:"fadeUp 0.35s ease both" }}>
            {q.question}
          </h2>

          {q.sub && (
            <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.7, fontWeight:300, marginBottom:26, animation:"fadeUp 0.35s ease 0.05s both" }}>
              {q.sub}
            </p>
          )}

          {q.type === "text" && (
            <textarea
              key={`input-${step}`}
              value={answers[q.key]}
              onChange={e => setAnswers(a => ({ ...a, [q.key]: e.target.value }))}
              placeholder={q.placeholder}
              rows={q.short ? 2 : 4}
              autoFocus
              style={{ width:"100%", background:"white", border:"1.5px solid var(--border)", borderLeft:"3px solid var(--teal)", color:"var(--ink)", fontFamily:"var(--sans)", fontSize:14, fontWeight:300, padding:"14px 16px", resize:"none", outline:"none", lineHeight:1.8, animation:"fadeUp 0.35s ease 0.1s both" }}
            />
          )}

          {q.type === "select" && (
            <div style={{ display:"flex", flexDirection:"column", gap:6, animation:"fadeUp 0.35s ease 0.1s both" }}>
              {q.options.map((opt, i) => (
                <button key={i} onClick={() => setAnswers(a => ({ ...a, [q.key]: opt }))}
                  style={{ background:answers[q.key]===opt?"var(--teal-bg)":"white", border:`1.5px solid ${answers[q.key]===opt?"var(--teal)":"var(--border)"}`, borderLeft:`3px solid ${answers[q.key]===opt?"var(--teal)":"var(--border)"}`, color:answers[q.key]===opt?"var(--ink)":"var(--muted)", fontFamily:"var(--sans)", fontSize:13, fontWeight:answers[q.key]===opt?400:300, padding:"13px 16px", cursor:"pointer", textAlign:"left", transition:"all 0.15s", lineHeight:1.55 }}>
                  {opt}
                </button>
              ))}
            </div>
          )}

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:26 }}>
            {step > 0 ? (
              <button onClick={() => setStep(s => s - 1)}
                style={{ background:"none", border:"none", color:"var(--muted)", fontFamily:"var(--sans)", fontSize:11, letterSpacing:"0.12em", textTransform:"uppercase", cursor:"pointer" }}>
                ← Back
              </button>
            ) : (
              <button onClick={onClose}
                style={{ background:"none", border:"none", color:"var(--muted)", fontFamily:"var(--sans)", fontSize:11, letterSpacing:"0.12em", textTransform:"uppercase", cursor:"pointer" }}>
                Cancel
              </button>
            )}
            <button onClick={next} disabled={!canNext}
              style={{ background:canNext?"var(--ink)":"transparent", border:`1.5px solid ${canNext?"var(--ink)":"var(--border)"}`, color:canNext?"var(--bg)":"var(--muted)", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"12px 28px", cursor:canNext?"pointer":"default", transition:"all 0.18s" }}>
              {isLast ? "Generate My Deep Report" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DEEP REPORT DISPLAY ──────────────────────────────────────────────────────
function DeepReportDisplay({ report, probeAnswers, aspirations, onRegenerate }) {
  const sections = [
    { label:"What the room is reading",          content:report.whatTheRoomIsReading,         color:"var(--teal)" },
    { label:"The signal gap",                    content:report.theSignalGap,                  color:"var(--amber)" },
    { label:"What this may mean professionally", content:report.whatThisMayMeanProfessionally, color:"var(--green)" },
    { label:"What this may be costing you",      content:report.whatThisMayBeCostingYou,       color:"var(--teal)" },
    { label:"The predictive observation",        content:report.thePredictiveObservation,      color:"var(--amber)" },
    { label:"What the next signal requires",     content:report.whatTheNextSignalRequires,     color:"var(--green)" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", animation:"fadeUp 0.5s ease both" }}>

      {/* Headline insight — the centrepiece */}
      <div style={{ padding:"32px 28px 28px", background:"white", border:"1.5px solid var(--bstrong)", borderTop:"3px solid var(--teal)" }}>
        <Cap style={{ marginBottom:16 }}>Professional Perception Analysis</Cap>
        <p style={{ fontFamily:"var(--serif)", fontSize:"clamp(18px,3vw,26px)", fontWeight:300, lineHeight:1.28, color:"var(--ink)" }}>
          {report.headlineInsight}
        </p>
      </div>

      {/* What they said — reflecting answers back */}
      <div style={{ padding:"16px 28px", background:"var(--surface)", borderBottom:"1px solid var(--border)", display:"flex", gap:24, flexWrap:"wrap" }}>
        {probeAnswers?.threeWords && (
          <div>
            <p style={{ fontSize:9, color:"var(--muted)", letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:4 }}>You said you were</p>
            <p style={{ fontFamily:"var(--serif)", fontSize:14, fontStyle:"italic", color:"var(--ink)" }}>"{probeAnswers.threeWords}"</p>
          </div>
        )}
        {probeAnswers?.knownFor && (
          <div>
            <p style={{ fontSize:9, color:"var(--muted)", letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:4 }}>You want them to remember you for</p>
            <p style={{ fontFamily:"var(--serif)", fontSize:14, fontStyle:"italic", color:"var(--ink)" }}>"{probeAnswers.knownFor}"</p>
          </div>
        )}
        {aspirations?.word && (
          <div>
            <p style={{ fontSize:9, color:"var(--muted)", letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:4 }}>The word you want to own</p>
            <p style={{ fontFamily:"var(--serif)", fontSize:14, fontStyle:"italic", color:"var(--teal)" }}>"{aspirations.word}"</p>
          </div>
        )}
      </div>

      {/* Analysis sections */}
      {sections.map((section, i) => (
        <div key={i} style={{ padding:"22px 28px", background:i%2===0?"white":"var(--surface)", borderBottom:"1px solid var(--border)", borderLeft:`3px solid ${section.color}`, animation:`fadeUp 0.4s ease ${i*0.07}s both` }}>
          <Cap style={{ marginBottom:10, color:"var(--muted)" }}>{section.label}</Cap>
          <p style={{ fontSize:14, lineHeight:1.9, fontWeight:300, fontFamily:"var(--serif)" }}>{section.content}</p>
        </div>
      ))}

      {/* The close — includes both setup and the closing statement */}
      <div style={{ padding:"26px 28px", background:"var(--teal-bg)", borderLeft:"3px solid var(--teal)", borderBottom:"1px solid var(--border)" }}>
        <p style={{ fontFamily:"var(--serif)", fontSize:15, lineHeight:1.85, fontStyle:"italic", color:"var(--ink)", fontWeight:300 }}>
          {report.theClose}
        </p>
      </div>

      {/* Persona bridge — personalised using their data */}
      <div style={{ padding:"36px 28px", background:"var(--ink)" }}>
        <Cap style={{ marginBottom:14, color:"var(--teal-lt)" }}>The next step</Cap>
        <h3 style={{ fontFamily:"var(--serif)", fontSize:"clamp(20px,3.2vw,28px)", fontWeight:300, color:"var(--bg)", marginBottom:16, lineHeight:1.18 }}>
          Most people have a vague sense of the professional they want to be.<br />
          <span style={{ color:"var(--teal-lt)", fontStyle:"italic" }}>Dfine defines it, articulates it, and dresses you to show up that way.</span>
        </h3>
        <p style={{ fontSize:13, color:"rgba(248,247,245,0.5)", lineHeight:1.9, fontWeight:300, marginBottom:6 }}>
          Signl showed you what the room sees. Dfine decides what you want them to see. They're different experiences — and you need both.
        </p>
        <p style={{ fontSize:13, color:"rgba(248,247,245,0.5)", lineHeight:1.9, fontWeight:300, marginBottom:10 }}>
          Dfine is a guided platform that surfaces your archetype, positioning, tone of voice, and perception strategy — turning a vague professional instinct into something precise and ownable.
          {aspirations?.archetype ? ` You described your direction as ${aspirations.archetype}. Dfine defines what that actually means for you specifically.` : ""}
        </p>
        <a href="https://dfine.app" target="_blank" rel="noopener noreferrer"
          style={{ display:"inline-block", background:"var(--teal)", color:"white", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"14px 34px", cursor:"pointer", textDecoration:"none" }}>
          Discover Dfine →
        </a>
      </div>

      <button onClick={onRegenerate}
        style={{ background:"none", border:"none", color:"var(--muted)", fontFamily:"var(--sans)", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", cursor:"pointer", padding:"16px 28px", alignSelf:"flex-start" }}>
        Regenerate deep report
      </button>
    </div>
  );
}

// ─── DEEP REPORT SECTION ──────────────────────────────────────────────────────
// Sits below the basic report. Locked until $10 payment. After unlock:
// probe questions → generation → deep report display.
function DeepReportSection({ snaps, aspirations, deepReport, setDeepReport, probeAnswers, setProbeAnswers }) {
  const [showProbe,   setShowProbe]   = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [unlocked,    setUnlocked]    = useState(!!(deepReport || probeAnswers));

  const generateDeepReport = async (answers) => {
    setGenerating(true);
    try {
      const reply  = await callClaude(
        [{ role:"user", content:"Generate my deep perception gap report." }],
        buildDeepReportSystem(snaps, aspirations, answers),
        null,
        1400
      );
      const parsed = parseJSON(reply);
      if (parsed) setDeepReport(parsed);
    } catch(e) { console.error(e); }
    setGenerating(false);
  };

  const handleProbeComplete = (answers) => {
    setProbeAnswers(answers);
    setShowProbe(false);
    generateDeepReport(answers);
  };

  // ── Locked state ──
  if (!unlocked) return (
    <div style={{ padding:"32px 28px", background:"var(--ink)", animation:"fadeUp 0.5s ease both" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
        <div style={{ width:1, height:20, background:"rgba(248,247,245,0.12)" }} />
        <Cap style={{ color:"var(--teal-lt)" }}>Deep Report</Cap>
      </div>
      <h3 style={{ fontFamily:"var(--serif)", fontSize:"clamp(20px,3.2vw,28px)", fontWeight:300, color:"var(--bg)", marginBottom:14, lineHeight:1.18 }}>
        How close is the professional you think you project<br />
        <span style={{ color:"var(--teal-lt)", fontStyle:"italic" }}>to the one the room actually sees?</span>
      </h3>
      <p style={{ fontSize:13, color:"rgba(248,247,245,0.5)", lineHeight:1.85, fontWeight:300, marginBottom:8 }}>
        Five questions. We compare what you say you project with what your signal data actually shows. Most people are surprised by the distance — not because they're wrong, but because they haven't looked closely enough.
      </p>
      <p style={{ fontSize:12, color:"rgba(248,247,245,0.35)", lineHeight:1.75, fontWeight:300, marginBottom:6, fontStyle:"italic" }}>
        You'll answer five questions before your report is revealed — not after. The thinking you do is what makes the report specific to you. The paywall comes at the end because that's when it means the most.
      </p>
      <p style={{ fontSize:11, color:"rgba(248,247,245,0.28)", lineHeight:1.75, fontWeight:300, marginBottom:28 }}>
        $10 one-off · Credited to your first month if you go on to try persona
      </p>
      {/* ── Payment integration point ──
          Replace the onClick below with your payment flow.
          On successful payment, call: setUnlocked(true); setShowProbe(true);
      */}
      <button
        onClick={() => { setUnlocked(true); setShowProbe(true); }}
        style={{ background:"var(--teal)", color:"white", border:"none", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"14px 34px", cursor:"pointer" }}>
        Unlock Deep Report — $10
      </button>
    </div>
  );

  // ── Probe in progress ──
  if (showProbe) return (
    <ProbeModal onComplete={handleProbeComplete} onClose={() => { setUnlocked(false); setShowProbe(false); }} />
  );

  // ── Generating ──
  if (generating || (probeAnswers && !deepReport)) return (
    <div style={{ padding:"52px 28px", textAlign:"center", background:"var(--surface)", borderTop:"1px solid var(--border)", animation:"fadeUp 0.4s ease both" }}>
      <Spinner size={20} />
      <p style={{ fontSize:13, color:"var(--muted)", marginTop:20, fontStyle:"italic", fontWeight:300, lineHeight:1.8 }}>
        Reading the gap between what you said<br />and what your signals showed…
      </p>
    </div>
  );

  // ── Report ready ──
  if (deepReport) return (
    <DeepReportDisplay
      report={deepReport}
      probeAnswers={probeAnswers}
      aspirations={aspirations}
      onRegenerate={() => { setDeepReport(null); generateDeepReport(probeAnswers); }}
    />
  );

  // ── Unlocked but no answers yet (edge case) ──
  return (
    <div style={{ padding:"32px 28px", textAlign:"center" }}>
      <button onClick={() => setShowProbe(true)}
        style={{ background:"var(--ink)", color:"var(--bg)", border:"none", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"14px 32px", cursor:"pointer" }}>
        Begin Probe Questions
      </button>
    </div>
  );
}

// ─── REPORT SCREEN ────────────────────────────────────────────────────────────
function ReportScreen({ snaps, aspirations, persona, reportData, setReportData, deepReport, setDeepReport, probeAnswers, setProbeAnswers, consequences, setConsequences }) {
  const [generating,   setGenerating]   = useState(false);
  const [showCard,     setShowCard]     = useState(false);
  const avg   = avgSignalsFrom(snaps);
  const ready = snaps.length >= SNAPS_REQUIRED;

  const axisColor = a => ({ socialCategory:"var(--teal)", cognitiveState:"var(--green)", status:"var(--amber)", aestheticCoherence:"var(--mauve)" }[a] || "var(--muted)");
  const axisLabel = a => ({ socialCategory:"Social Category", cognitiveState:"Cognitive State", status:"Status Signal", aestheticCoherence:"Aesthetic Coherence" }[a] || a);

  const generate = async () => {
    if (!ready) return;
    setGenerating(true);
    try {
      // Step 1: Generate gap analysis
      const reply  = await callClaude([{ role:"user", content:"Generate my signal gap analysis report." }], buildGapAnalysisSystem(snaps, aspirations), null, 1200);
      const parsed = parseJSON(reply);
      setReportData(parsed || null);

      // Step 2: Generate consequence layer if gaps exist
      if (parsed?.signalGaps && parsed.signalGaps.length > 0) {
        const consequenceReply = await callClaude(
          [{ role:"user", content:"Generate consequence statements for each signal gap, naming specific professional outcomes." }],
          buildConsequenceLayerSystem(parsed.signalGaps, aspirations),
          null,
          1000
        );
        const consequenceParsed = parseJSON(consequenceReply);
        setConsequences(consequenceParsed || null);
      }
    } catch(e) { console.error(e); }
    setGenerating(false);
  };

  useEffect(() => { if (ready && !reportData && !generating) generate(); }, [ready]);

  if (!ready) return (
    <div style={{ minHeight:"100vh", paddingTop:56, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", padding:40 }}>
        <p style={{ fontFamily:"var(--serif)", fontSize:22, fontWeight:300, marginBottom:10 }}>Not yet</p>
        <p style={{ fontSize:13, color:"var(--muted)", fontWeight:300, lineHeight:1.7 }}>
          {SNAPS_REQUIRED - snaps.length} more snap{SNAPS_REQUIRED-snaps.length!==1?"s":""} to go.
        </p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", paddingTop:56 }}>
      <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid var(--border)" }}>
        <div style={{ maxWidth:700, margin:"0 auto" }}>
          <Cap style={{ marginBottom:6 }}>Signal Gap Analysis</Cap>
          <h2 style={{ fontFamily:"var(--serif)", fontSize:"clamp(22px,4vw,32px)", fontWeight:300, lineHeight:1.1 }}>Your Report</h2>
        </div>
      </div>

      <div style={{ maxWidth:700, margin:"0 auto", padding:"28px 24px" }}>
        {generating ? (
          <div style={{ textAlign:"center", paddingTop:80, animation:"fadeUp 0.5s ease both" }}>
            <Spinner size={22} />
            <p style={{ fontSize:13, color:"var(--muted)", marginTop:20, fontStyle:"italic", fontWeight:300 }}>Analysing your signal pattern…</p>
          </div>

        ) : reportData ? (
          <div style={{ display:"flex", flexDirection:"column", gap:14, animation:"fadeUp 0.5s ease both" }}>

            {/* Current vs Aspired */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:2 }}>
              <div style={{ padding:"20px 22px", background:"white", border:"1px solid var(--border)", borderTop:"3px solid var(--muted)" }}>
                <Cap style={{ marginBottom:8, color:"var(--muted)" }}>Currently projecting</Cap>
                <h3 style={{ fontFamily:"var(--serif)", fontSize:18, fontWeight:300, lineHeight:1.2 }}>{reportData.currentPersonaLabel}</h3>
              </div>
              <div style={{ padding:"20px 22px", background:"var(--teal-bg)", border:"1px solid var(--border)", borderTop:"3px solid var(--teal)" }}>
                <Cap style={{ marginBottom:8 }}>Aiming to project</Cap>
                <h3 style={{ fontFamily:"var(--serif)", fontSize:18, fontWeight:300, lineHeight:1.2 }}>{reportData.aspirationalPersonaLabel}</h3>
              </div>
            </div>

            {/* Gap summary */}
            <div style={{ padding:"22px 24px", background:"white", border:"1.5px solid var(--bstrong)", borderTop:"3px solid var(--teal)" }}>
              <Cap style={{ marginBottom:12 }}>The Gap</Cap>
              <p style={{ fontFamily:"var(--serif)", fontSize:16, lineHeight:1.9, fontWeight:300, fontStyle:"italic" }}>{reportData.gapSummary}</p>
            </div>

            {/* Signal radar with target overlay */}
            {avg && reportData.signalGaps?.length>0 && (
              <div>
                <Cap style={{ marginBottom:10, color:"var(--muted)" }}>Where the gap lives</Cap>
                <SignalRadar signals={avg}
                  targetSignals={reportData.signalGaps.reduce((acc,g) => ({ ...acc, [g.axis]:g.target }), {})} />
                <div style={{ display:"flex", flexDirection:"column", gap:2, marginTop:2 }}>
                  {reportData.signalGaps.map((gap,i) => (
                    <div key={i} style={{ padding:"12px 16px", background:"white", border:"1px solid var(--border)", borderLeft:`3px solid ${axisColor(gap.axis)}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16 }}>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:10, color:axisColor(gap.axis), letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4, fontWeight:500 }}>{axisLabel(gap.axis)}</p>
                        <p style={{ fontSize:13, color:"var(--muted)", fontWeight:300, lineHeight:1.65 }}>{gap.note}</p>
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0 }}>
                        <p style={{ fontSize:12, color:"var(--muted)", fontWeight:300 }}>{gap.current} → <span style={{ color:axisColor(gap.axis), fontWeight:500 }}>{gap.target}</span></p>
                        <p style={{ fontSize:10, color:gap.direction==="up"?"var(--green)":"var(--amber)", marginTop:2 }}>{gap.direction==="up"?"↑":"↓"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Adjustments */}
            {reportData.adjustments?.length>0 && (
              <div>
                <Cap style={{ marginBottom:10, color:"var(--muted)" }}>Three things worth shifting</Cap>
                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {reportData.adjustments.map((adj,i) => (
                    <div key={i} style={{ padding:"18px 20px", background:"white", border:"1px solid var(--border)", borderLeft:`3px solid ${axisColor(adj.axis)}`, animation:`fadeUp 0.4s ease ${i*0.08}s both` }}>
                      <p style={{ fontSize:14, fontWeight:400, marginBottom:6, fontFamily:"var(--serif)" }}>{adj.title}</p>
                      <p style={{ fontSize:13, color:"var(--muted)", lineHeight:1.75, fontWeight:300 }}>{adj.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Closing note */}
            {reportData.closingNote && (
              <div style={{ padding:"20px 24px", background:"var(--surface)", border:"1px solid var(--border)", borderLeft:"3px solid var(--bstrong)" }}>
                <p style={{ fontSize:14, fontFamily:"var(--serif)", lineHeight:1.9, fontWeight:300, fontStyle:"italic" }}>{reportData.closingNote}</p>
              </div>
            )}

            {/* ── DEEP REPORT ── */}
            <DeepReportSection
              snaps={snaps}
              aspirations={aspirations}
              deepReport={deepReport}
              setDeepReport={setDeepReport}
              probeAnswers={probeAnswers}
              setProbeAnswers={setProbeAnswers}
            />

            {/* Share card */}
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <Cap style={{ color:"var(--muted)" }}>Your signal card</Cap>
                <button onClick={() => setShowCard(!showCard)} style={{ background:"none", border:"none", color:"var(--teal)", fontFamily:"var(--sans)", fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer" }}>
                  {showCard?"Hide":"Show"} card
                </button>
              </div>
              {showCard && (
                <div style={{ animation:"pop 0.4s ease both" }}>
                  <ShareCard persona={persona} avgSignals={avg} />
                  <p style={{ fontSize:11, color:"var(--muted)", marginTop:12, fontWeight:300, fontStyle:"italic" }}>Screenshot to share with your network.</p>
                </div>
              )}
            </div>

            <button onClick={generate} style={{ background:"none", border:"none", color:"var(--muted)", fontFamily:"var(--sans)", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", cursor:"pointer", alignSelf:"flex-start" }}>
              Regenerate report
            </button>
          </div>

        ) : (
          <div style={{ textAlign:"center", paddingTop:60 }}>
            <button onClick={generate} style={{ background:"var(--ink)", color:"var(--bg)", border:"none", fontFamily:"var(--sans)", fontSize:11, fontWeight:500, letterSpacing:"0.16em", textTransform:"uppercase", padding:"14px 36px", cursor:"pointer" }}>
              Generate My Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,         setScreen]         = useState(SCREENS.HOME);
  const [snaps,          setSnaps]          = useState([]);
  const [persona,        setPersona]        = useState(null);
  const [wardrobe,       setWardrobe]       = useState([]);
  const [aspirations,    setAspirations]    = useState(null);
  const [reportData,     setReportData]     = useState(null);
  const [deepReport,     setDeepReport]     = useState(null);   // NEW
  const [probeAnswers,   setProbeAnswers]   = useState(null);   // NEW
  const [consequences,   setConsequences]   = useState(null);   // NEW: Consequence layer
  const [hydrated,       setHydrated]       = useState(false);
  const [showAspiration, setShowAspiration] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, p, w, a, r, dr, pa, c] = await Promise.all([
        sGet("signl:snaps"),
        sGet("signl:persona"),
        sGet("signl:wardrobe"),
        sGet("signl:aspirations"),
        sGet("signl:reportData"),
        sGet("signl:deepReport"),    // NEW
        sGet("signl:probeAnswers"),  // NEW
        sGet("signl:consequences"),  // NEW: Consequence layer
      ]);
      if (s)  setSnaps(s);
      if (p)  setPersona(p);
      if (w)  setWardrobe(w);
      if (a)  setAspirations(a);
      if (r)  setReportData(r);
      if (dr) setDeepReport(dr);    // NEW
      if (pa) setProbeAnswers(pa);  // NEW
      if (c)  setConsequences(c);   // NEW: Consequence layer
      setHydrated(true);
    })();
  }, []);

  useEffect(() => { if (hydrated) sSet("signl:snaps",        snaps);        }, [snaps,        hydrated]);
  useEffect(() => { if (hydrated) sSet("signl:persona",      persona);      }, [persona,      hydrated]);
  useEffect(() => { if (hydrated) sSet("signl:wardrobe",     wardrobe);     }, [wardrobe,     hydrated]);
  useEffect(() => { if (hydrated) sSet("signl:aspirations",  aspirations);  }, [aspirations,  hydrated]);
  useEffect(() => { if (hydrated) sSet("signl:reportData",   reportData);   }, [reportData,   hydrated]);
  useEffect(() => { if (hydrated) sSet("signl:deepReport",   deepReport);   }, [deepReport,   hydrated]);    // NEW
  useEffect(() => { if (hydrated) sSet("signl:probeAnswers", probeAnswers); }, [probeAnswers,  hydrated]);   // NEW
  useEffect(() => { if (hydrated) sSet("signl:consequences", consequences); }, [consequences,  hydrated]);   // NEW: Consequence layer

  const handleSaveAspirations = data => {
    setAspirations(data);
    setShowAspiration(false);
  };

  if (!hydrated) return (
    <>
      <GlobalStyles />
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:18, background:"var(--bg)" }}>
        <div style={{ width:40, height:40, borderRadius:"50%", border:"1.5px solid var(--bstrong)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width:14, height:14, borderRadius:"50%", border:"1.5px solid var(--teal)", animation:"pulse 1.4s ease infinite" }} />
        </div>
        <p style={{ fontSize:10, letterSpacing:"0.2em", textTransform:"uppercase", color:"var(--muted)", fontFamily:"var(--sans)", fontWeight:400 }}>Restoring…</p>
      </div>
    </>
  );

  const snapCount   = snaps.length;
  const reportReady = snapCount >= SNAPS_REQUIRED && !!reportData;

  return (
    <>
      <GlobalStyles />
      <Nav screen={screen} setScreen={setScreen} snapCount={snapCount} personaReady={!!persona} reportReady={reportReady} />
      {screen === SCREENS.HOME    && <HomeScreen snaps={snaps} setSnaps={setSnaps} setWardrobe={setWardrobe} aspirations={aspirations} setShowAspiration={setShowAspiration} setScreen={setScreen} />}
      {screen === SCREENS.SIGNALS && <SignalsScreen snaps={snaps} persona={persona} setPersona={setPersona} />}
      {screen === SCREENS.REPORT  && (
        <ReportScreen
          snaps={snaps}
          aspirations={aspirations}
          persona={persona}
          reportData={reportData}
          setReportData={setReportData}
          deepReport={deepReport}
          setDeepReport={setDeepReport}
          probeAnswers={probeAnswers}
          setProbeAnswers={setProbeAnswers}
          consequences={consequences}
          setConsequences={setConsequences}
        />
      )}
      {showAspiration && <AspirationModal onSave={handleSaveAspirations} />}
    </>
  );
}
