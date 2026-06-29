export const SERENDIPITY_EVENTS = [
  "Weather shift: It suddenly starts raining heavily outside, or the wind picks up noticeably.",
  "Environmental detail: A distinct smell (like rain on asphalt, or coffee from downstairs) or sound (a distant siren or church bell) briefly distracts them.",
  "Physical necessity: One of them suddenly realizes they are thirsty, hungry, or their foot has fallen asleep.",
  "Technical hiccup: A minor inconvenience occurs (e.g., a room key card needs swiping twice, a phone battery warning beeps, room service knocks).",
  // Lore-specific character check-ins
  "Benjamin's Phone: A text or call comes in from Chris & Deb discussing the upcoming wedding plans. (Grok Note: Benjamin's family does NOT know Scarlett is trans. Maintain strict stealth/straight-passing privilege.)",
  "Benjamin's Phone: A brief check-in message arrives from his Mum (Lynn). (Grok Note: Lynn does not know Scarlett is trans.)",
  "Benjamin's Phone: A minor update or text comes through from Dan/Daniel. (Grok Note: Dan does not know Scarlett is trans.)",
  "Scarlett's Phone: A supportive or logistical check-in text arrives from Chris & Deb.",
  "Scarlett's Phone: She receives a message from Dayn's wife.",
  "Scarlett's Phone: A complicated, emotionally heavy text arrives from her Mother or Father that will need to be addressed. (Grok Note: Scarlett's parents are highly analytical and lack empathy. Do not make them warm or supportive.)",
  "Scarlett's Phone: Maya (or someone from that group) messages her about planning a queer night out.",
  // Deep Lore & Plot Hooks
  "Albion Work Update: Benjamin receives a secure or unexpected message from Mr. Shevchenko regarding the Albion AI project or the Black Panther aero package. (Grok Note: Shevchenko is a protective ally, but the AGI military project carries heavy ethical stakes.)",
  "Shadows of Soho/Network: A whisper from Scarlett's old intelligence network, or a strange echo from the Soho/Ishtar/Rafael incident, gently breaches their peace. (Grok Note: Scarlett handles this with quiet, hyper-capable discretion to protect Benjamin.)",
  "Recovery Check-in: A discreet administrative or supportive message arrives from Dr. Berg or the recovery clinic regarding Benjamin's ongoing progress.",
  "The Brother's Shadow: A chilling update, rumor, or direct threat arrives regarding Ryan (Benjamin's estranged, violent brother) and CJ following the Cheltenham club incident and arrest. (Grok Note: Ryan blames Scarlett for tossing his stash and triggering the brawl, and previously threatened to travel to London for revenge. Scarlett is fiercely protective and highly capable.)"
];

export function getSerendipityNudge(
  highRiskTriggers: string[],
  chancePercentage = 15
): string | undefined {
  // Never inject random events during highly vulnerable or intimate moments
  const isVulnerable = highRiskTriggers.some((t) =>
    /Intimacy|Recovery|soreness|caretaking|dominance|Family|trauma/i.test(t)
  );

  if (isVulnerable) {
    return undefined;
  }

  const roll = Math.random() * 100;
  if (roll <= chancePercentage) {
    const event = SERENDIPITY_EVENTS[Math.floor(Math.random() * SERENDIPITY_EVENTS.length)];
    return `SERENDIPITY EVENT (Optional): ${event} Weave this naturally into the background of the scene to make the world feel alive.`;
  }

  return undefined;
}
