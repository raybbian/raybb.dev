import {
  Vec2,
  add,
  TWO_PI,
  catmullRomClosedInto,
  constrainAngle,
  cubicBezierAppend,
  fromAngle,
  heading,
  mag,
  poolAt,
  relativeAngleDiff,
  scale,
  sub,
} from "@/lib/math";
import { triangulateInto } from "@/lib/triangulate";
import type { Rgba } from "./koiPattern";
import { mulberry32 } from "./koiPattern";
import { noise1 } from "./noise";
import { Chain } from "./Chain";

// ===========================================================================
// Tunable constants. Everything that shapes the fish lives here so the body,
// fins, swim feel, and UV layout can be retuned without hunting through code.
// ===========================================================================

// --- Swim dynamics (tuned per 1/60 s tick; resolve() scales by dt) ----------
const TICK_FPS = 60; // reference tick rate the constants below assume
const HEAD_MAX_TURN = Math.PI / 64; // turning-radius limit per tick
const CRUISE_SPEED = 12; // default px/tick cruise (per-fish overridable)

// Lazy autonomous wander: a value-noise lane drives an ABSOLUTE target
// heading (not one relative to the current heading — that produced a
// constant turn rate, i.e. endless circling). The per-tick turn limit
// slews toward it, yielding calm gentle curves with no jitter.
const HEADING_NOISE_FREQ = 0.06; // lower = lazier, calmer meander
const WANDER_WEIGHT = 1; // baseline desired-direction weight

// Soft containment: bias toward center once the head enters the edge inset.
const CONTAIN_INSET = 90; // px from each edge where the pull starts
const CONTAIN_GAIN = 4; // max center-pull weight (dominates wander)

// Cursor avoidance: veer away, stronger the closer the pointer is. Near the
// cursor the fish also speeds up and turns harder (the only time it's not
// calm) — everywhere else movement stays slow.
const AVOID_RADIUS = 240; // px influence range
const AVOID_STRENGTH = 7; // max away weight at the cursor
const FLEE_SPEED_GAIN = 2.6; // extra speed factor at the cursor
const FLEE_TURN_GAIN = 3; // extra turn-limit factor at the cursor

// Treat seeking: a dropped treat within reach makes the fish "interested" —
// it commits toward the nearest one and (the closer it is) turns harder and
// speeds up. A large but not pond-wide radius.
const SEEK_RADIUS = 1024; // px the treat's pull reaches
const SEEK_WEIGHT = 6; // desired-direction weight toward the treat
const SEEK_SPEED_GAIN = 1.8; // extra speed factor when locked on
const SEEK_TURN_GAIN = 2; // extra turn-limit factor when locked on
const SATED_DUR = 2; // sec a fish ignores treats after eating one

// Speed: slow gentle noise variation around cruise + an occasional, soft
// burst-and-glide (kept subtle so the default look stays calm).
const SPEED_NOISE_FREQ = 0.08;
const SPEED_VAR = 0.2; // +/- fraction of cruise from the noise lane
const SPEED_SMOOTH = 2.5; // approach rate toward target speed (1/s)
const BURST_GAP_MIN = 7; // s of cruising between bursts
const BURST_GAP_MAX = 16;
const BURST_DUR = 0.6; // s a burst lasts
const BURST_MULT = 1.35; // speed multiplier during a burst

// --- Depth (0 = just under the surface, 1 = deep) --------------------------
// Drives the water pass: deeper reads bluer, a shallow (but submerged) fish
// bulges/refracts the surface more. Each fish holds a fixed depth set at
// construction — it never changes or oscillates. Stays clear of 0 so the
// depth buffer can use 0 as "open water".
const DEPTH_BASE = 0.4; // default submergence when none is supplied

// --- Spine / body silhouette -----------------------------------------------
const CHAIN_JOINTS = 12;
const CHAIN_LINK_SIZE = 64; // px between spine joints
const CHAIN_MAX_BEND = Math.PI / 8; // max bend per joint
const BODY_WIDTHS = [68, 81, 84, 83, 77, 64, 51, 38, 32, 19]; // half-width / seg
const BODY_SEGMENTS = BODY_WIDTHS.length; // body uses the first N spine joints

// --- Outline / curve tessellation ------------------------------------------
const CURVE_SEGMENTS = 14;
const BEZIER_SEGMENTS = 22;
const FLOATS_PER_VERT = 8; // interleaved x,y,r,g,b,a,u,v

// --- Caudal (tail) fin ------------------------------------------------------
const CAUDAL_AMP = 1.5; // outer spread (parabolic in segment index)
const CAUDAL_WIDTH_GAIN = 6; // inner spread vs head->tail bend
const CAUDAL_WIDTH_CLAMP = 13; // inner spread clamp (+/-)

// --- Dorsal fin -------------------------------------------------------------
const DORSAL_CTRL_DIST = 16; // bezier control-arm length vs body bend

// --- Pectoral / ventral fins & eyes ----------------------------------------
const HALF_PI = Math.PI / 2; // body flank + ventral + eye side angle
const PECTORAL_ANGLE = Math.PI / 3;
const PECTORAL_ROT = Math.PI / 4;
const PECTORAL_W = 160;
const PECTORAL_H = 64;
const VENTRAL_ROT = Math.PI / 4;
const VENTRAL_W = 96;
const VENTRAL_H = 32;
const EYE_OFFSET = -18; // inset from the snout joint
const EYE_DIAM = 24;
const EYE: Rgba = [0, 0, 0, 1]; // black: readable on light koi bodies

// --- UV layout (drives the procedural koi pattern) -------------------------
const TIP_U_OVERSHOOT = 1 / 30; // push tail u past 1 so it keeps sweeping
const SNOUT_TIP_LEN = 4; // how far the nose tip pokes past joint 0
const SNOUT_ANGLE = Math.PI / 6;
const SNOUT_U_SIDE = -1 / 10;
const SNOUT_U_TIP = -1 / 8;
const SNOUT_V_HI = 0.66;
const SNOUT_V_MID = 0.5;
const SNOUT_V_LO = 0.34;
const FLANK_V_TOP = 0;
const FLANK_V_BOT = 1;
const CENTER_V = 0.5;

// UV sentinel: fins share the solid pipeline but stay a flat color. Far out of
// band so it never collides with the body's small-negative snout u.
const NO_UV: Vec2 = { x: -1000, y: -1000 };

export interface FishColors {
  base: Rgba;
  mid: Rgba;
  accent: Rgba;
  fin: Rgba; // flat color for caudal/dorsal/pectoral/ventral fins
}

// Per-fish swim personality. Decorrelating these keeps a school from moving
// in lockstep. All optional; resolve() falls back to sensible defaults.
export interface SwimParams {
  cruiseSpeed?: number; // px/tick at 60fps
  turnRateMult?: number; // multiplies HEAD_MAX_TURN
  noisePhaseHeading?: number; // offset into the heading noise lane
  noisePhaseSpeed?: number; // offset into the speed noise lane
  seed?: number; // burst-timer RNG seed
}

// Upper bounds for the persistent geometry scratch (must stay >= what the
// FishRenderer GPU buffers hold). The actual fish is far smaller; these are
// allocated once so buildGeometry() never allocates per frame.
const MAX_VERT_FLOATS = 8192 * FLOATS_PER_VERT;
const MAX_INDICES = 24576;
const MAX_FIN_FLOATS = 4 * 9; // 4 fins, 9 floats/instance
const MAX_EYE_FLOATS = 2 * 9; // 2 eyes

export interface FishGeometry {
  // Interleaved x,y,r,g,b,a,u,v — `*Count` = floats/indices actually used;
  // the typed arrays are reused across frames (only [0, count) is valid).
  verts: Float32Array;
  vCount: number;
  indices: Uint32Array;
  iCount: number;
  // 9 floats per instance: cx,cy,rx,ry,rot,r,g,b,a
  finInstances: Float32Array;
  finCount: number;
  eyeInstances: Float32Array;
  eyeCount: number;
}

export class Fish {
  spine: Chain;
  private colors: FishColors;
  private t = 0; // seconds, accumulated in resolve() — drives swim noise
  private fixedDepth: number; // constant submergence, set once at construction

  // Scaled body metrics (computed once from the constructor's scale).
  private bodyWidth: number[];
  private snoutTipLen: number;
  private eyeDiam: number;
  private eyeOffset: number;
  private pectoralW: number;
  private pectoralH: number;
  private ventralW: number;
  private ventralH: number;
  private dorsalCtrlDist: number;
  private caudalAmp: number;
  private caudalWidthGain: number;
  private caudalWidthClamp: number;

  // Swim personality + integrator state.
  private cruiseSpeed: number;
  private turnRateMult: number;
  private noisePhaseHeading: number;
  private noisePhaseSpeed: number;
  private speed: number;
  private burstRng: () => number;
  private burstTimer: number;
  private bursting = false;
  private satedTimer = 0; // sec left ignoring treats after a recent meal

  // Persistent geometry scratch (allocated once, refilled each frame).
  private vbuf = new Float32Array(MAX_VERT_FLOATS);
  private ibuf = new Uint32Array(MAX_INDICES);
  private finBuf = new Float32Array(MAX_FIN_FLOATS);
  private eyeBuf = new Float32Array(MAX_EYE_FLOATS);
  private geo: FishGeometry = {
    verts: this.vbuf,
    vCount: 0,
    indices: this.ibuf,
    iCount: 0,
    finInstances: this.finBuf,
    finCount: 0,
    eyeInstances: this.eyeBuf,
    eyeCount: 0,
  };

  // Reused buildGeometry() scratch: control-point rings, tessellated curve
  // outputs, the centerline lookup, and the ear-clip index buffer. All grow
  // once to their (constant) size and are mutated in place every frame.
  private _caudal: Vec2[] = [];
  private _caudalRing: Vec2[] = [];
  private _bodyRing: Vec2[] = [];
  private _bodyUV: Vec2[] = [];
  private _ringPos: Vec2[] = [];
  private _ringUV: Vec2[] = [];
  private _dorsal: Vec2[] = [];
  private _c1: Vec2 = { x: 0, y: 0 };
  private _c2: Vec2 = { x: 0, y: 0 };
  private _clU: number[] = [];
  private _clP: Vec2[] = [];
  private _clEnd0: Vec2 = { x: 0, y: 0 };
  private _clEnd1: Vec2 = { x: 0, y: 0 };
  private _center: Vec2 = { x: 0, y: 0 };
  private _triIdx: number[] = [];

  constructor(
    origin: Vec2,
    colors: FishColors,
    depth = DEPTH_BASE,
    scale = 1,
    swim: SwimParams = {},
  ) {
    this.spine = new Chain(
      origin,
      CHAIN_JOINTS,
      CHAIN_LINK_SIZE * scale,
      CHAIN_MAX_BEND,
    );
    this.colors = colors;
    this.fixedDepth = depth < 0 ? 0 : depth > 1 ? 1 : depth;

    this.bodyWidth = BODY_WIDTHS.map((w) => w * scale);
    this.snoutTipLen = SNOUT_TIP_LEN * scale;
    this.eyeDiam = EYE_DIAM * scale;
    this.eyeOffset = EYE_OFFSET * scale;
    this.pectoralW = PECTORAL_W * scale;
    this.pectoralH = PECTORAL_H * scale;
    this.ventralW = VENTRAL_W * scale;
    this.ventralH = VENTRAL_H * scale;
    this.dorsalCtrlDist = DORSAL_CTRL_DIST * scale;
    this.caudalAmp = CAUDAL_AMP * scale;
    this.caudalWidthGain = CAUDAL_WIDTH_GAIN * scale;
    this.caudalWidthClamp = CAUDAL_WIDTH_CLAMP * scale;

    this.cruiseSpeed = swim.cruiseSpeed ?? CRUISE_SPEED;
    this.turnRateMult = swim.turnRateMult ?? 1;
    this.noisePhaseHeading = swim.noisePhaseHeading ?? 0;
    this.noisePhaseSpeed = swim.noisePhaseSpeed ?? 0;
    this.speed = this.cruiseSpeed;
    this.burstRng = mulberry32((swim.seed ?? 1) >>> 0);
    // Stagger the first burst so a school never pulses in unison.
    this.burstTimer =
      BURST_GAP_MIN + this.burstRng() * (BURST_GAP_MAX - BURST_GAP_MIN);
  }

  // Fixed submergence in [0,1]; deeper = bluer + calmer surface. Constant for
  // this fish's lifetime — no bob. Always > 0 so the depth buffer can reserve
  // 0 for "no fish here".
  get depth(): number {
    return this.fixedDepth;
  }

  // Snout tip (the actual nose point, scene space) — the fish navigates
  // toward and eats treats with its mouth, not its head-joint centre.
  get snout(): Vec2 {
    return this.pos(0, 0, this.snoutTipLen);
  }

  // Called when this fish eats a treat: it loses interest in treats (won't
  // seek or eat) until the sated timer runs out.
  eat(): void {
    this.satedTimer = SATED_DUR;
  }

  get sated(): boolean {
    return this.satedTimer > 0;
  }

  // Autonomous swim. dt in seconds; constants are tuned at 60fps so the
  // per-tick limits normalize against that. `mouse` is an obstacle to veer
  // away from (null = ignore it, e.g. a slow cursor); `treats` are scene-space
  // points the fish gets interested in and speeds toward.
  resolve(
    dt: number,
    mouse: Vec2 | null,
    treats: Vec2[],
    width: number,
    height: number,
  ): void {
    this.t += dt;
    if (this.satedTimer > 0) this.satedTimer -= dt;
    const f = dt * TICK_FPS;
    const head = this.spine.joints[0];
    const prev = this.spine.angles[0];
    // Treats are pursued/eaten with the mouth, so seek from the snout tip.
    const snout = this.pos(0, 0, this.snoutTipLen);

    // 1. Lazy wander: the noise lane is an ABSOLUTE slowly-drifting heading.
    //    (A heading relative to `prev` gave a sustained offset every frame =
    //    a constant turn rate = endless circling.)
    const n = noise1(this.t * HEADING_NOISE_FREQ + this.noisePhaseHeading);
    const wander = fromAngle(n * TWO_PI);
    let dx = wander.x * WANDER_WEIGHT;
    let dy = wander.y * WANDER_WEIGHT;

    // 2. Soft containment: pull toward center once inside the edge inset,
    //    ramping hard enough to dominate the wander near the boundary.
    const pen = Math.max(
      0,
      CONTAIN_INSET - head.x,
      head.x - (width - CONTAIN_INSET),
      CONTAIN_INSET - head.y,
      head.y - (height - CONTAIN_INSET),
    );
    if (pen > 0) {
      const c = sub({ x: width / 2, y: height / 2 }, head);
      const cl = mag(c) || 1;
      const w = Math.min(CONTAIN_GAIN, (pen / CONTAIN_INSET) * CONTAIN_GAIN);
      dx += (c.x / cl) * w;
      dy += (c.y / cl) * w;
    }

    // 3. Cursor avoidance: veer away, stronger the closer it is. `prox` in
    //    [0,1] is how close the pointer is — it also drives the brief
    //    speed-up and sharper turning below.
    let prox = 0;
    if (mouse) {
      const away = sub(head, mouse);
      const ad = mag(away);
      if (ad < AVOID_RADIUS && ad > 1e-3) {
        prox = 1 - ad / AVOID_RADIUS;
        const k = prox * AVOID_STRENGTH;
        dx += (away.x / ad) * k;
        dy += (away.y / ad) * k;
      }
    }

    // 3b. Treat seeking: commit toward the nearest treat in range. `seek` in
    //     [0,1] is how close it is — it also drives the speed-up / sharper
    //     turning below, so an interested fish clearly hurries over.
    let seek = 0;
    let nearest: Vec2 | null = null;
    let nearestD = SEEK_RADIUS;
    if (this.satedTimer <= 0)
      for (const t of treats) {
        const d = mag(sub(t, snout));
        if (d < nearestD) {
          nearestD = d;
          nearest = t;
        }
      }
    if (nearest) {
      seek = 1 - nearestD / SEEK_RADIUS;
      const to = sub(nearest, snout);
      const tl = mag(to) || 1;
      dx += (to.x / tl) * SEEK_WEIGHT;
      dy += (to.y / tl) * SEEK_WEIGHT;
    }

    // 4. Turn-limited heading toward the blended desire (turns harder when
    //    fleeing the cursor or homing in on a treat).
    const desired = heading({ x: dx, y: dy });
    const newHeading = constrainAngle(
      desired,
      prev,
      HEAD_MAX_TURN *
        this.turnRateMult *
        (1 + FLEE_TURN_GAIN * prox + SEEK_TURN_GAIN * seek) *
        f,
    );

    // 5. Speed: slow noise variation + periodic burst-and-glide.
    this.burstTimer -= dt;
    if (this.burstTimer <= 0) {
      this.bursting = !this.bursting;
      this.burstTimer = this.bursting
        ? BURST_DUR
        : BURST_GAP_MIN + this.burstRng() * (BURST_GAP_MAX - BURST_GAP_MIN);
    }
    const sN = noise1(this.t * SPEED_NOISE_FREQ + this.noisePhaseSpeed);
    const targetSpeed =
      this.cruiseSpeed *
      (1 + (sN * 2 - 1) * SPEED_VAR) *
      (this.bursting ? BURST_MULT : 1) *
      (1 + FLEE_SPEED_GAIN * prox) *
      (1 + SEEK_SPEED_GAIN * seek);
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * SPEED_SMOOTH);

    this.spine.resolve(add(head, scale(fromAngle(newHeading), this.speed * f)));
  }

  private posInto(
    out: Vec2,
    i: number,
    angleOffset: number,
    lenOffset: number,
  ): Vec2 {
    const j = this.spine.joints[i];
    const a = this.spine.angles[i];
    const r = this.bodyWidth[i] + lenOffset;
    out.x = j.x + Math.cos(a + angleOffset) * r;
    out.y = j.y + Math.sin(a + angleOffset) * r;
    return out;
  }

  private pos(i: number, angleOffset: number, lenOffset: number): Vec2 {
    return this.posInto({ x: 0, y: 0 }, i, angleOffset, lenOffset);
  }

  buildGeometry(): FishGeometry {
    const j = this.spine.joints;
    const a = this.spine.angles;

    const headToMid1 = relativeAngleDiff(a[0], a[6]);
    const headToMid2 = relativeAngleDiff(a[0], a[7]);
    const headToTail = headToMid1 + relativeAngleDiff(a[6], a[11]);

    const { base: BASE, fin: FIN } = this.colors;
    const vbuf = this.vbuf;
    const ibuf = this.ibuf;
    let vLen = 0; // floats written into vbuf
    let iLen = 0; // indices written into ibuf

    // `uv` rides index-aligned with `ring`; NO_UV sentinel keeps fins flat.
    const emit = (ring: Vec2[], color: Rgba, uv?: Vec2[]) => {
      const rn = ring.length;
      if (rn < 3) return;
      const start = vLen / FLOATS_PER_VERT;
      for (let i = 0; i < rn; i++) {
        const p = ring[i];
        const tx = uv ? uv[i].x : NO_UV.x;
        const ty = uv ? uv[i].y : NO_UV.y;
        vbuf[vLen++] = p.x;
        vbuf[vLen++] = p.y;
        vbuf[vLen++] = color[0];
        vbuf[vLen++] = color[1];
        vbuf[vLen++] = color[2];
        vbuf[vLen++] = color[3];
        vbuf[vLen++] = tx;
        vbuf[vLen++] = ty;
      }
      iLen = triangulateInto(ring, rn, this._triIdx, ibuf, iLen, start);
    };

    // Caudal fin (drawn first, sits under body)
    const caudal = this._caudal;
    let cw = 0;
    for (let i = 8; i < 12; i++) {
      const w = this.caudalAmp * headToTail * (i - 8) * (i - 8);
      const ang = a[i] - HALF_PI;
      const p = poolAt(caudal, cw++);
      p.x = j[i].x + Math.cos(ang) * w;
      p.y = j[i].y + Math.sin(ang) * w;
    }
    for (let i = 11; i >= 8; i--) {
      const w = Math.max(
        -this.caudalWidthClamp,
        Math.min(this.caudalWidthClamp, headToTail * this.caudalWidthGain),
      );
      const ang = a[i] + HALF_PI;
      const p = poolAt(caudal, cw++);
      p.x = j[i].x + Math.cos(ang) * w;
      p.y = j[i].y + Math.sin(ang) * w;
    }
    if (caudal.length > cw) caudal.length = cw;
    emit(catmullRomClosedInto(caudal, CURVE_SEGMENTS, this._caudalRing), FIN);

    // Body. The silhouette is the smoothed outline ring; UVs are built in
    // lockstep with it (one entry per control point). u runs head->tail, v
    // runs across the flanks. Tip points push u just past [0,1] so u keeps
    // changing through the nose/tail instead of flattening into a patch.
    const bodyRing = this._bodyRing;
    const bodyUV = this._bodyUV;
    let bw = 0;
    const uvAt = (k: number, x: number, y: number) => {
      const u = poolAt(bodyUV, k);
      u.x = x;
      u.y = y;
    };
    for (let i = 0; i < BODY_SEGMENTS; i++) {
      this.posInto(poolAt(bodyRing, bw), i, HALF_PI, 0);
      uvAt(bw, i / (BODY_SEGMENTS - 1), FLANK_V_TOP);
      bw++;
    }
    this.posInto(poolAt(bodyRing, bw), BODY_SEGMENTS - 1, Math.PI, 0);
    uvAt(bw, 1 + TIP_U_OVERSHOOT, CENTER_V);
    bw++;
    for (let i = BODY_SEGMENTS - 1; i >= 0; i--) {
      this.posInto(poolAt(bodyRing, bw), i, -HALF_PI, 0);
      uvAt(bw, i / (BODY_SEGMENTS - 1), FLANK_V_BOT);
      bw++;
    }
    this.posInto(poolAt(bodyRing, bw), 0, -SNOUT_ANGLE, 0);
    uvAt(bw, SNOUT_U_SIDE, SNOUT_V_HI);
    bw++;
    this.posInto(poolAt(bodyRing, bw), 0, 0, this.snoutTipLen);
    uvAt(bw, SNOUT_U_TIP, SNOUT_V_MID);
    bw++;
    this.posInto(poolAt(bodyRing, bw), 0, SNOUT_ANGLE, 0);
    uvAt(bw, SNOUT_U_SIDE, SNOUT_V_LO);
    bw++;
    if (bodyRing.length > bw) bodyRing.length = bw;
    if (bodyUV.length > bw) bodyUV.length = bw;
    const ringPos = catmullRomClosedInto(
      bodyRing,
      CURVE_SEGMENTS,
      this._ringPos,
    );
    const ringUV = catmullRomClosedInto(bodyUV, CURVE_SEGMENTS, this._ringUV);

    // Spine centerline (v = 0.5), sampled by u. Triangulating the outline
    // with ear-clipping produced a bend-dependent topology that remapped the
    // pattern; instead stitch a ribbon from this centerline out to each
    // boundary point at the same u — deterministic, identical every frame.
    const clU = this._clU;
    const clP = this._clP;
    let m = 0;
    clU[m] = SNOUT_U_TIP;
    clP[m] = this.posInto(this._clEnd0, 0, 0, this.snoutTipLen);
    m++;
    for (let i = 0; i < BODY_SEGMENTS; i++) {
      clU[m] = i / (BODY_SEGMENTS - 1);
      clP[m] = j[i];
      m++;
    }
    clU[m] = 1 + TIP_U_OVERSHOOT;
    clP[m] = this.posInto(this._clEnd1, BODY_SEGMENTS - 1, Math.PI, 0);
    m++;
    const clLen = m;
    const centerAt = (u: number): Vec2 => {
      const cs = this._center;
      if (u <= clU[0]) {
        cs.x = clP[0].x;
        cs.y = clP[0].y;
        return cs;
      }
      const li = clLen - 1;
      if (u >= clU[li]) {
        cs.x = clP[li].x;
        cs.y = clP[li].y;
        return cs;
      }
      for (let i = 1; i < clLen; i++) {
        if (u <= clU[i]) {
          const t = (u - clU[i - 1]) / (clU[i] - clU[i - 1]);
          const a0 = clP[i - 1];
          const a1 = clP[i];
          cs.x = a0.x + (a1.x - a0.x) * t;
          cs.y = a0.y + (a1.y - a0.y) * t;
          return cs;
        }
      }
      cs.x = clP[li].x;
      cs.y = clP[li].y;
      return cs;
    };

    const n = ringPos.length;
    const bodyBase = vLen / FLOATS_PER_VERT;
    for (let k = 0; k < n; k++) {
      const rp = ringPos[k];
      const ru = ringUV[k];
      const cp = centerAt(ru.x);
      // 2k = boundary vertex, 2k+1 = its centerline partner.
      vbuf[vLen++] = rp.x;
      vbuf[vLen++] = rp.y;
      vbuf[vLen++] = BASE[0];
      vbuf[vLen++] = BASE[1];
      vbuf[vLen++] = BASE[2];
      vbuf[vLen++] = BASE[3];
      vbuf[vLen++] = ru.x;
      vbuf[vLen++] = ru.y;
      vbuf[vLen++] = cp.x;
      vbuf[vLen++] = cp.y;
      vbuf[vLen++] = BASE[0];
      vbuf[vLen++] = BASE[1];
      vbuf[vLen++] = BASE[2];
      vbuf[vLen++] = BASE[3];
      vbuf[vLen++] = ru.x;
      vbuf[vLen++] = CENTER_V;
    }
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      const r0 = bodyBase + 2 * k;
      const c0 = bodyBase + 2 * k + 1;
      const r1 = bodyBase + 2 * k2;
      const c1 = bodyBase + 2 * k2 + 1;
      ibuf[iLen++] = r0;
      ibuf[iLen++] = r1;
      ibuf[iLen++] = c1;
      ibuf[iLen++] = r0;
      ibuf[iLen++] = c1;
      ibuf[iLen++] = c0;
    }

    // Dorsal fin (on top of body)
    const dorsal = this._dorsal;
    let dw = 0;
    {
      const p = poolAt(dorsal, dw++);
      p.x = j[4].x;
      p.y = j[4].y;
    }
    dw = cubicBezierAppend(j[4], j[5], j[6], j[7], BEZIER_SEGMENTS, dorsal, dw);
    const ang6 = a[6] + HALF_PI;
    const m6 = headToMid2 * this.dorsalCtrlDist;
    this._c1.x = j[6].x + Math.cos(ang6) * m6;
    this._c1.y = j[6].y + Math.sin(ang6) * m6;
    const ang5 = a[5] + HALF_PI;
    const m5 = headToMid1 * this.dorsalCtrlDist;
    this._c2.x = j[5].x + Math.cos(ang5) * m5;
    this._c2.y = j[5].y + Math.sin(ang5) * m5;
    dw = cubicBezierAppend(
      j[7],
      this._c1,
      this._c2,
      j[4],
      BEZIER_SEGMENTS,
      dorsal,
      dw,
    );
    dw -= 1; // dorsal.pop(): last sample == j[4] == ring start
    if (dorsal.length > dw) dorsal.length = dw;
    emit(dorsal, FIN);

    const finBuf = this.finBuf;
    const eyeBuf = this.eyeBuf;
    let finLen = 0;
    let eyeLen = 0;
    const emitInst = (
      buf: Float32Array,
      off: number,
      c: Vec2,
      w: number,
      h: number,
      rot: number,
      color: Rgba,
    ): number => {
      buf[off++] = c.x;
      buf[off++] = c.y;
      buf[off++] = w / 2;
      buf[off++] = h / 2;
      buf[off++] = rot;
      buf[off++] = color[0];
      buf[off++] = color[1];
      buf[off++] = color[2];
      buf[off++] = color[3];
      return off;
    };

    // Pectoral fins
    finLen = emitInst(
      finBuf,
      finLen,
      this.pos(3, PECTORAL_ANGLE, 0),
      this.pectoralW,
      this.pectoralH,
      a[2] - PECTORAL_ROT,
      FIN,
    );
    finLen = emitInst(
      finBuf,
      finLen,
      this.pos(3, -PECTORAL_ANGLE, 0),
      this.pectoralW,
      this.pectoralH,
      a[2] + PECTORAL_ROT,
      FIN,
    );
    // Ventral fins
    finLen = emitInst(
      finBuf,
      finLen,
      this.pos(7, HALF_PI, 0),
      this.ventralW,
      this.ventralH,
      a[6] - VENTRAL_ROT,
      FIN,
    );
    finLen = emitInst(
      finBuf,
      finLen,
      this.pos(7, -HALF_PI, 0),
      this.ventralW,
      this.ventralH,
      a[6] + VENTRAL_ROT,
      FIN,
    );

    eyeLen = emitInst(
      eyeBuf,
      eyeLen,
      this.pos(0, HALF_PI, this.eyeOffset),
      this.eyeDiam,
      this.eyeDiam,
      0,
      EYE,
    );
    eyeLen = emitInst(
      eyeBuf,
      eyeLen,
      this.pos(0, -HALF_PI, this.eyeOffset),
      this.eyeDiam,
      this.eyeDiam,
      0,
      EYE,
    );

    const geo = this.geo;
    geo.vCount = vLen;
    geo.iCount = iLen;
    geo.finCount = finLen;
    geo.eyeCount = eyeLen;
    return geo;
  }
}
