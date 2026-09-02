# Scarlett Imagine Modular Guide

Compiled from the four extraction prompts in this thread.  
Nothing from those four answers has been omitted.

Use this with:

1. The **Core Anchor** (do not rewrite)
2. **One** outfit module
3. **One** lighting/camera block
4. The avoid-list when a generation drifts

Reference images in the Imagine UI (floral-dress classic + a good racing-suit close-up) should carry the face when Imagine 2.0 text-only consistency drops.

---

## Prompt 1: Core Anchor

**Physical base only — no clothes, lighting, or background.**

This is the most stable combination we actually found, taken from the racing-suit era that still produced “definitely her” results, plus the face details that survived later testing. The long-weight blocks after Imagine 2.0 were less reliable; this wording is the one that held best.

### Core Anchor string

```
Beautiful 22-year-old Scandinavian woman, exactly 5'4" tall, curvy hourglass figure, full natural breasts, narrow waist, wide hips, long toned legs. Soft diamond-shaped face with high sculpted cheekbones, clean angular yet delicate jawline, slightly pointed chin with subtle cleft chin, very compact youthful proportions, noticeably smaller forehead and shorter midface, soft youthful rounded cheeks with subtle natural asymmetry. Moderately dense constellation of small realistic freckles irregularly clustered across nose bridge, cheeks, under eyes and forehead. Vivid Baby Blue eyes with highly detailed iris, pronounced black limbal rings and subtle sectoral heterochromia with delicate Agate colour inclusions in the right eye only. Small narrow cute slightly upturned nose with a thin gold hook nose ring in the left nostril. Soft natural expression. Chin-to-shoulder length voluminous fiery copper-red hair, wild and curly with natural waves, high volume and abundant flyaways. Both earlobes have small gold hoop rings. Left ear only: vertical stack of small gold studs some set with tiny gemstones plus a thin horizontal gold scaffold bar at the top. Realistic pale porcelain skin with uneven pore visibility, slight tonal variation and a natural rosy flush.
```

### Short lock-in to append when needed

```
(exact match to original low-res reference face shape proportions and imperfections:1.95), (soft diamond face, high sculpted cheekbones, smaller forehead, shorter midface, subtle cleft chin, soft rounded cheeks:1.9), (dense irregular freckles on pale skin:1.9), (vivid Baby Blue eyes, dark limbal rings, Agate heterochromia in right eye only:1.9), (voluminous wild curly fiery copper-red hair with flyaways:1.85)
```

### What actually proved reliable

- **Face:** “soft diamond” + smaller forehead + shorter midface + soft rounded cheeks + subtle cleft. Dropping “sculpted/angular” too hard made her look older or like Ronda Rousey; dropping it entirely made her generic.
- **Hair:** voluminous, wild, curly copper-red with flyaways beat the sleek bob for likeness.
- **Eyes:** Baby Blue + dark limbal rings + Agate in the *right eye only*.
- **Skin:** pale + irregular freckle clustering, not a uniform dusting.
- **Body:** 5'4", hourglass, full breasts, narrow waist, wide hips, long legs.

Keep this block untouched. Outfit, pose, and setting should sit in separate modules so the face signal does not get diluted.

---

## Prompt 2: Failure Modes and Negative Prompts

These are the patterns that actually broke her likeness in this thread, not generic Stable Diffusion negatives.

### What consistently damaged the face

| Cause | What happened |
|---|---|
| **“Sculpted / angular / supermodel / strong jaw” pushed too hard** | Face went older, harder, sometimes Ronda Rousey. The working look is *soft diamond + delicate jaw*, not a fashion-editorial skull. |
| **Sleek controlled bob / “ends tucked, nothing soft remains”** | Hair and face both drifted. The stable look is *voluminous, wild, curly copper with flyaways*. |
| **Huge monolithic prompts** (face + full outfit list + jet + second person + jewellery + camera + weights) | Face diluted into a generic pretty redhead. Imagine 2.0 made this worse. |
| **Two-person scenes** (bed, tub, jet with Ben in frame) | Face and anatomy broke first. Second body stole the lock. |
| **“Various sexy dresses / bodycon / plunging / latex” lists** | Outfit collapsed to one look and the face went with it. |
| **Ear described as a “stack of rings / hoops up the shell”** | Floating rings that don’t pierce. Scaffold became jewellery floating on skin. |
| **Extreme weights on everything (`:1.9`–`:2.2` on 6+ clauses)** | Large heads, over-tight features, uncanny midface. |
| **“Sharp liner, cold eyes, matte mouth” as armour** | Aged her. Classic Scarlett is softer around the eyes and mouth. |
| **Heart-shaped face** | Wrong geometry vs the original (diamond / compact midface). |
| **Over-reducing “puppy fat”** | Stripped the youthful rounded cheeks that keep her looking 21–22. |

Hair *colour* was relatively stable. What broke her was hair *structure* (sleek bob vs wild volume) and face *hardness*, not outfit colour stealing the copper.

### Definitive avoid-list

Use these as negatives, or just never put them in the positive prompt:

```
heart-shaped face, strong masculine jaw, square jaw, overly angular supermodel face, harsh cheekbones, long midface, large forehead, aged face, mature face, wrinkles, crow's feet, Ronda Rousey, athletic masculine bone structure, sleek tight bob, blunt bob, tucked-in hair with no volume, perfectly smooth ringlet curtains, stack of hoop earrings up the ear, large gold hoops on the cartilage, floating earrings, disconnected piercings, generic pretty redhead, plastic skin, poreless beauty filter, heavy contour, overlined lips, cold sharp makeup, two people, couple shot, man in frame, crowded scene, multiple outfit options, various dresses, random bodycon, latex catsuit, top-down selfie angle, holding the sheet, cartoon proportions, bobble head, duplicated limbs
```

### Shorter negative block you can paste

```
(heart-shaped face, strong jaw, long midface, aged features, sleek blunt bob, hoop stack on cartilage, generic redhead, two people, plastic skin:1.4)
```

### Words that are *not* banned (they were part of the working lock)

Keep these. They are the core, not the problem:

- soft diamond-shaped face
- smaller forehead / shorter midface
- subtle cleft chin
- soft rounded cheeks
- vivid Baby Blue + dark limbal rings + Agate in the **right eye only**
- voluminous wild curly fiery copper-red hair
- irregular freckle clustering
- 5'4" hourglass

### Practical rule

If a generation starts to look “almost her but older / sharper / shorter-haired,” the first things to strip are: extra people, extra clothes lists, “sculpted/angular,” and the sleek bob. Put the Core Anchor back in first, then add *one* outfit module.

---

## Prompt 3: Lighting and Camera Constants

The images that actually looked like her shared a simple photographic language: **real lens, shallow focus on the eyes, natural or warm practical light, visible skin texture**. The ones that felt “AI” usually had beauty-filter skin, hard fashion lighting, or a wide scene that stole focus from the face.

### Default block (use this on almost everything)

```
Ultra-realistic photography, 50mm lens, shallow depth of field, sharp focus on the eyes and face, soft natural daylight, gentle shadows, realistic skin texture with visible pores and slight tonal variation, highly detailed individual hair strands, coherent anatomy, no beauty-filter skin
```

### Modular variants (swap the lighting line only)

**Indoor / apartment / sofa**

```
Ultra-realistic photography, 50mm lens, shallow depth of field, sharp focus on the eyes and face, soft warm indoor light from lamps and window fill, gentle shadows, realistic skin texture with visible pores, highly detailed hair strands
```

**Intimate / bedroom close-up**

```
Ultra-realistic photography, 50mm lens, very shallow depth of field, sharp focus on the eyes, warm bedside lamp light, soft falloff, gentle shadows across the cheekbones, realistic skin texture, highly detailed freckles and hair
```

**Outdoor / jet / street / daylight professional**

```
Ultra-realistic photography, 50mm lens, shallow depth of field, sharp focus on the face, soft natural daylight, clean high-end documentary look, gentle shadows, realistic skin texture, highly detailed fabric and hair
```

**Track / pit / overcast action**

```
Ultra-realistic cinematic photography, 35mm lens, shallow depth of field, sharp focus on her face, soft overcast daylight mixed with practical ambient light, subtle atmospheric depth, realistic skin texture, highly detailed fabric and metal
```

**Golden hour**

```
Ultra-realistic photography, 50mm lens, shallow depth of field, sharp focus on the eyes, warm golden-hour sidelight, soft rim on the hair, gentle shadows, realistic skin texture, highly detailed copper-red hair
```

### What actually made the best frames work

- **50mm** for head-to-waist and portraits. **35mm** only when the car or room has to be in the shot.
- **Shallow DOF + sharp eyes** more than “cinematic” as a vibe word.
- **Soft natural / warm practical light** beat studio beauty lighting every time.
- **Pores, freckles, uneven skin, individual hair strands** kept her from turning plastic.
- Film grain is optional. A little helps; “heavy film grain / vintage” starts to smear freckles.

### Short append block

If you only want one line to drop on the end of any prompt:

```
50mm lens, shallow depth of field, sharp focus on eyes and face, soft natural light, realistic pores and freckles, highly detailed copper-red hair, ultra-realistic photography
```

Avoid as lighting/camera defaults: beauty dish, ring light, HDR, oversharpened, plastic skin, wide-angle distortion, top-down selfie, fisheye, heavy cinematic colour grade. Those were the looks that made her feel generic rather than like her.

---

## Prompt 4: Wardrobe Integration Rules

The model does not “forget” her because the clothes are expensive. It forgets her when **the outfit module is as long as the face module**, or when you ask it to invent a wardrobe instead of wear one look.

### Order (this is the rule)

1. **Core Anchor** (face + body + hair)
2. **One outfit** (one silhouette, one fabric, one colour story)
3. **Pose / setting** (short)
4. **Lighting & camera**
5. **One short lock-in**

Do **not** put clothes first. Every time the outfit led, the face drifted toward a generic redhead wearing that garment.

### How to write the clothes so they don’t steal the face

- Name **one** look, not a menu.
  - Bad: `various sexy skintight outfits such as plunging bodycon, halter, latex, satin in black, red, green…`
  - Good: `structured black single-button YSL-style blazer over a matte black silk camisole, high-waisted black tailored trousers, sharp black heels`
- Describe **structure and fabric**, not a catalogue of sexiness.
  - Useful words: tailored, single-button, nipped waist, sharp crease, oversized, slipped off one shoulder, matte silk, cashmere, structured shoulders.
  - Dangerous words in long lists: plunging, provocative, various, random, bodycon options.
- Keep jewellery to the **always-on hardware** already in the Core Anchor. Don’t re-specify the whole ear stack in the outfit paragraph unless the shot is a close-up of the ear.
- For complex materials (latex, patent, heavy tailoring): **one garment family only**. Latex bodysuit *or* tailored suit. Not both, and not latex plus a list of dresses.

### Weighting that actually helped

What worked:

- Face/body lock **higher** than clothes.
- Clothes **one** moderate weight, not six competing ones.

Practical ceiling after Imagine 2.0:

```
(Core Anchor face and body:1.35)
(this specific outfit only:1.2)
```

What failed:

- `:1.9`–`:2.2` on face *and* hair *and* eyes *and* outfit *and* pose
- That produced big heads, over-tight features, and still lost the clothes.

If you use a **reference image** (floral dress / good racing close-up), drop most weights. Let the reference hold the face; let the text hold the clothes.

### Full-body vs portrait

- Complex designer clothing + full body = highest drift risk.
- Safest test: **head-to-mid-thigh** first. If the face holds, then go full length.
- Feet/anklet shots need the feet named once (`rose-gold anklet on left ankle, glossy black square pedicure`) and nothing else competing.

### Copy-paste skeleton

```
[CORE ANCHOR]

She is wearing [ONE specific outfit: garment + fabric + colour + one footwear]. [One pose]. [One setting].

[LIGHTING & CAMERA BLOCK]
```

**Lock-in (optional, keep short):**

```
(same woman, same face structure, freckles, copper-red curly hair, Baby Blue eyes with right-eye Agate heterochromia:1.35), ([exact outfit phrase]:1.2)
```

### Hard rules for the wardrobe system

- Never let Scarlett’s “browse the wardrobe” output dump five candidate outfits into one Imagine prompt. Pick **one** winning look, then generate.
- Colour theory belongs in *her* decision, not in the image prompt as “complement her hair with sage / burgundy / champagne options.” Choose the colour, then name that colour once.
- If the face breaks after a clothing change, do not add more clothing words. Shorten the outfit line and restore the Core Anchor verbatim.

---

## Assembly example

```
[CORE ANCHOR from Prompt 1]

She is wearing tight black jeans and an oversized charcoal cashmere sweater slipped off one shoulder. She sits on a two-seater sofa with her feet drawn up. A rose-gold gemstone anklet is visible on her left ankle. Glossy black square manicure and matching pedicure.

[INDOOR LIGHTING BLOCK from Prompt 3]
```

Optional short lock-in:

```
(same woman, same face structure, freckles, copper-red curly hair, Baby Blue eyes with right-eye Agate heterochromia:1.35), (tight black jeans, oversized charcoal cashmere slipped off one shoulder, feet drawn up on sofa:1.2)
```
