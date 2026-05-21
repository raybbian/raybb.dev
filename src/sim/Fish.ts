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
import { mulberry32 } from "@/lib/math";
import { noise1 } from "./noise";
import { Chain } from "./Chain";
import {
  BODY_WIDTHS,
  CHAIN_LINK_SIZE,
  CHAIN_MAX_BEND,
  CURVE_SEGMENTS,
  HALF_PI,
  SNOUT_ANGLE,
  SNOUT_TIP_LEN,
  buildBodyMesh,
  createBodyMeshScratch,
  type BodyMeshScratch,
  type SnoutShape,
} from "./fishBodyMesh";

// Swim dynamics tuned per 1/60 s tick; resolve() scales by dt.
const TICK_FPS = 60;
const HEAD_MAX_TURN = Math.PI / 64; // turning-radius limit per tick
const CRUISE_SPEED = 12; // default px/tick cruise (per-fish overridable)

// The noise lane drives an ABSOLUTE target heading, not one relative to the
// current heading — relative gave a constant turn rate (endless circling).
const HEADING_NOISE_FREQ = 0.06; // lower = lazier, calmer meander
const WANDER_WEIGHT = 1; // baseline desired-direction weight

// Per-edge push (not a center pull) so a cornered fish skims the boundary and
// veers off instead of all fish homing on the middle.
const CONTAIN_INSET = 140; // px from each edge where the push starts
const CONTAIN_GAIN = 5; // push weight at the very edge (dominates wander)

const AVOID_RADIUS = 240; // px influence range
const AVOID_STRENGTH = 7; // max away weight at the cursor
const FLEE_SPEED_GAIN = 2.6; // extra speed factor at the cursor
const FLEE_TURN_GAIN = 3; // extra turn-limit factor at the cursor

const SEEK_RADIUS = 1024; // px the treat's pull reaches
const SEEK_WEIGHT = 6; // desired-direction weight toward the treat
const SEEK_SPEED_GAIN = 1.8; // extra speed factor when locked on
const SEEK_TURN_GAIN = 2; // extra turn-limit factor when locked on
const SATED_DUR = 2; // sec a fish ignores treats after eating one
// Each meal closes this fraction of the gap to maxScale, so a fish grows
// slightly with every feed and asymptotes at the cap (diminishing returns).
const GROW_FEED_FRAC = 0.1;

const SPEED_NOISE_FREQ = 0.08;
const SPEED_VAR = 0.2; // +/- fraction of cruise from the noise lane
const SPEED_SMOOTH = 2.5; // approach rate toward target speed (1/s)
const BURST_GAP_MIN = 7; // s of cruising between bursts
const BURST_GAP_MAX = 16;
const BURST_DUR = 0.6; // s a burst lasts
const BURST_MULT = 1.35; // speed multiplier during a burst

// Depth 0 = just under the surface, 1 = deep. Fixed per fish; stays clear of
// 0 so the depth buffer can reserve 0 for "open water".
const DEPTH_BASE = 0.4; // default submergence when none is supplied

const CHAIN_JOINTS = 12; // body uses the first BODY_WIDTHS.length of these

const BEZIER_SEGMENTS = 22;
const FLOATS_PER_VERT = 8; // interleaved x,y,r,g,b,a,u,v

const CAUDAL_AMP = 1.5; // outer spread (parabolic in segment index)
const CAUDAL_WIDTH_GAIN = 6; // inner spread vs head->tail bend
const CAUDAL_WIDTH_CLAMP = 13; // inner spread clamp (+/-)

const DORSAL_CTRL_DIST = 16; // bezier control-arm length vs body bend
// The DRAWN dorsal only flares with body bend (its control arms ~ headToMid,
// which -> 0 when swimming straight), but a real fin stands upright regardless
// of heading. The self-shadow floors its fin-height proxy with this intrinsic
// arch (0 at the spine ends so the band stays on the body, peak mid-spine) so
// a straight fish still casts a wide, curved-outward band, not a sliver.
const DORSAL_FIN_HEIGHT = 14; // world px per unit scale, peak mid-spine

const PECTORAL_ANGLE = Math.PI / 3;
const PECTORAL_ROT = Math.PI / 4;
const PECTORAL_W = 160;
const PECTORAL_H = 64;
const VENTRAL_ROT = Math.PI / 4;
const VENTRAL_W = 96;
const VENTRAL_H = 32;
const EYE_OFFSET = -18; // inset from the snout joint
const EYE_DIAM = 24;
const EYE: Rgba = [0, 0, 0, 1];

// mouthOpen in [0,1] morphs the three snout control points into the koi "O".
// Idle: brief open->close pulses. Pursuing a treat: shut during the chase,
// then held wide open once within MOUTH_ANTICIP_DIST until the food is gone.
const MOUTH_GULP_DUR = 0.55; // s for one full open->close pulse
const MOUTH_GULP_OPEN_FRAC = 0.35; // fraction of the pulse spent opening
const MOUTH_ANTICIP_DIST = 220; // px snout->treat where the mouth opens to feed
const MOUTH_HOLD_SMOOTH = 14; // approach rate of the held open/shut ramp (1/s)
const MOUTH_IDLE_GAP_MIN = 2.5; // s between idle gulps (min)
const MOUTH_IDLE_GAP_MAX = 6; // s between idle gulps (max)
const MOUTH_GAP_NOISE_FREQ = 0.7; // jitters the idle gap so a school desyncs
// Snout shape at full open (m=1); m=0 keeps SNOUT_ANGLE / SNOUT_TIP_LEN.
const SNOUT_OPEN_ANGLE = Math.PI / 3; // lips swing from 30deg out to 60deg
const SNOUT_OPEN_LIP_OUT = 10; // px the lip corners bulge outward
const SNOUT_OPEN_TIP_LEN = -15; // tip on the lip chord -> flat (not pointed) end
const SNOUT_OPEN_PROTRUDE = 50; // px the whole mouth telescopes forward when open

// Sentinel: fins share the solid pipeline but stay flat. Far out of band so
// it never collides with the body's small-negative snout u.
const NO_UV: Vec2 = { x: -1000, y: -1000 };
// Dorsal self-shadow verts: a distinct sentinel, checked before FIN_SENTINEL
// in fish.frag (must stay below SHADOW_SENTINEL = -2000 there).
const SHADOW_UV: Vec2 = { x: -3000, y: -3000 };

// Dorsal self-shadow tunables. MUST match DORSAL_SHADOW_* / SHADOW_SUN_DIR in
// render/ShadowRenderer.ts (sim/ must not import from render/). The fin is
// vertical: its shadow is a band pinned at the spine and sheared along the
// world-space sun vector by the fin's local height. World +y == screen +y, so
// the screen-space sun dir is used directly, normalized. buildGeometry()'s
// sunSignX mirrors SUN_X with the theme (matches shadowSunDir): +1 light
// (down-right), -1 dark (down-left), lerped through 0 on a toggle.
const DORSAL_SHADOW_SCALE = 0.9;
const DORSAL_SHADOW_ALPHA = 0.42;
const SUN_LEN = Math.hypot(0.75, 0.83);
const SUN_X = 0.75 / SUN_LEN;
const SUN_Y = 0.83 / SUN_LEN;

export interface FishColors {
  base: Rgba;
  mid: Rgba;
  accent: Rgba;
  fin: Rgba; // flat color for caudal/dorsal/pectoral/ventral fins
}

// Decorrelating these keeps a school from moving in lockstep.
export interface SwimParams {
  cruiseSpeed?: number; // px/tick at 60fps
  turnRateMult?: number; // multiplies HEAD_MAX_TURN
  noisePhaseHeading?: number; // offset into the heading noise lane
  noisePhaseSpeed?: number; // offset into the speed noise lane
  noisePhaseMouth?: number; // offset into the idle mouth-rhythm noise lane
  seed?: number; // burst-timer RNG seed
}

// Must stay >= the FishRenderer GPU buffer sizes. Allocated once so
// buildGeometry() never allocates per frame.
const MAX_VERT_FLOATS = 8192 * FLOATS_PER_VERT;
const MAX_INDICES = 24576;
const MAX_FIN_FLOATS = 4 * 9; // 4 fins, 9 floats/instance
const MAX_EYE_FLOATS = 2 * 9; // 2 eyes

export interface FishGeometry {
  // Arrays are reused across frames; only [0, *Count) is valid. Verts are
  // interleaved x,y,r,g,b,a,u,v; instances are cx,cy,rx,ry,rot,r,g,b,a.
  verts: Float32Array;
  vCount: number;
  indices: Uint32Array;
  iCount: number;
  // Index where the body silhouette begins (== end of caudal). Lets callers
  // that don't drive the procedural pattern texture (e.g. the blog figures)
  // color the caudal as a fin instead of as the body.
  bodyIdxStart: number;
  // Index where the dorsal self-shadow band begins (== end of caudal+body)
  // and where the dorsal fin begins (== end of the band). Lets the renderer
  // alpha-blend the band and exclude it from the shadow-cast pass.
  shadowIdxStart: number;
  dorsalIdxStart: number;
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

  // Set by applyScale() from the constructor and re-derived on each feed.
  // Public so blog figures can pass the actual per-fish scaled widths to
  // the shared fishBodyMesh helper.
  bodyWidth!: number[];
  private snoutTipLen!: number;
  private snoutTipLenOpen!: number;
  private snoutOpenLipOut!: number;
  private snoutProtrude!: number;
  private eyeDiam!: number;
  private eyeOffset!: number;
  private pectoralW!: number;
  private pectoralH!: number;
  private ventralW!: number;
  private ventralH!: number;
  private dorsalCtrlDist!: number;
  private dorsalFinHeight!: number;
  private caudalAmp!: number;
  private caudalWidthGain!: number;
  private caudalWidthClamp!: number;

  // Sense/containment distances, baked screen-scaled (see CRUISE_SPEED note).
  private containInset: number;
  private avoidRadius: number;
  private seekRadius: number;
  private mouthAnticipDist: number;

  private cruiseSpeed: number;
  private turnRateMult: number;
  private noisePhaseHeading: number;
  private noisePhaseSpeed: number;
  private noisePhaseMouth: number;
  private speed: number;
  private burstRng: () => number;
  private burstTimer: number;
  private bursting = false;
  private curScale: number; // grows toward maxScale as the fish is fed
  private maxScale: number; // growth cap (the un-reduced rng max)
  private satedTimer = 0; // sec left ignoring treats after a recent meal
  // Latest per-component contributions to the desired heading, set in
  // resolve(). Read-only via `debug` so the behavior figure can visualize
  // them. Each is the weighted vector that gets summed into (dx, dy).
  private _vWanderX = 0;
  private _vWanderY = 0;
  private _vContainX = 0;
  private _vContainY = 0;
  private _vAvoidX = 0;
  private _vAvoidY = 0;
  private _vSeekX = 0;
  private _vSeekY = 0;
  private mouthOpen = 0; // [0,1] the snout geometry reads; pulses or held open
  private gulpT = -1; // sec into the current gulp pulse; <0 = mouth shut
  private nextGulpIn = 0; // sec until the next gulp starts (when shut)

  private vbuf = new Float32Array(MAX_VERT_FLOATS);
  private ibuf = new Uint32Array(MAX_INDICES);
  private finBuf = new Float32Array(MAX_FIN_FLOATS);
  private eyeBuf = new Float32Array(MAX_EYE_FLOATS);
  private geo: FishGeometry = {
    verts: this.vbuf,
    vCount: 0,
    indices: this.ibuf,
    iCount: 0,
    bodyIdxStart: 0,
    shadowIdxStart: 0,
    dorsalIdxStart: 0,
    finInstances: this.finBuf,
    finCount: 0,
    eyeInstances: this.eyeBuf,
    eyeCount: 0,
  };

  // Reused buildGeometry() scratch, mutated in place every frame.
  private _caudal: Vec2[] = [];
  private _caudalRing: Vec2[] = [];
  private _dorsal: Vec2[] = [];
  private _dorsalShadow: Vec2[] = [];
  private _dorsalShadowUV: Vec2[] = [];
  private _sf0: number[] = [];
  private _sf1: number[] = [];
  private _c1: Vec2 = { x: 0, y: 0 };
  private _c2: Vec2 = { x: 0, y: 0 };
  private _triIdx: number[] = [];
  private _snout: SnoutShape = {
    sideAngle: SNOUT_ANGLE,
    sideLenOffset: 0,
    tipLenOffset: SNOUT_TIP_LEN,
    protrudeX: 0,
    protrudeY: 0,
  };
  private _bodyMesh: BodyMeshScratch = createBodyMeshScratch();

  constructor(
    origin: Vec2,
    colors: FishColors,
    depth = DEPTH_BASE,
    scale = 1,
    swim: SwimParams = {},
    screenScale = 1,
    maxScale = scale,
  ) {
    this.spine = new Chain(
      origin,
      CHAIN_JOINTS,
      CHAIN_LINK_SIZE * scale,
      CHAIN_MAX_BEND,
    );
    this.colors = colors;
    this.fixedDepth = depth < 0 ? 0 : depth > 1 ? 1 : depth;

    this.curScale = scale;
    this.maxScale = Math.max(scale, maxScale);
    this.applyScale(scale);

    // Speed and sense radii scale with the screen like sizes do, so the
    // school behaves the same relative to the pond at any resolution.
    this.containInset = CONTAIN_INSET * screenScale;
    this.avoidRadius = AVOID_RADIUS * screenScale;
    this.seekRadius = SEEK_RADIUS * screenScale;
    this.mouthAnticipDist = MOUTH_ANTICIP_DIST * screenScale;
    this.cruiseSpeed = (swim.cruiseSpeed ?? CRUISE_SPEED) * screenScale;
    this.turnRateMult = swim.turnRateMult ?? 1;
    this.noisePhaseHeading = swim.noisePhaseHeading ?? 0;
    this.noisePhaseSpeed = swim.noisePhaseSpeed ?? 0;
    this.noisePhaseMouth = swim.noisePhaseMouth ?? 0;
    this.speed = this.cruiseSpeed;
    this.burstRng = mulberry32((swim.seed ?? 1) >>> 0);
    // Stagger first burst/gulp so a school never pulses in unison.
    this.burstTimer =
      BURST_GAP_MIN + this.burstRng() * (BURST_GAP_MAX - BURST_GAP_MIN);
    this.nextGulpIn =
      MOUTH_IDLE_GAP_MIN +
      this.burstRng() * (MOUTH_IDLE_GAP_MAX - MOUTH_IDLE_GAP_MIN);
  }

  get depth(): number {
    return this.fixedDepth;
  }

  // Nose point in scene space; fish navigate/eat with the mouth, not the
  // head-joint centre.
  get snout(): Vec2 {
    return this.pos(0, 0, this.snoutTipLen);
  }

  // Re-derives every size-dependent field from `s`. Called once at
  // construction and again on each feed so the fish can grow in place.
  private applyScale(s: number): void {
    this.spine.linkSize = CHAIN_LINK_SIZE * s;
    this.bodyWidth = BODY_WIDTHS.map((w) => w * s);
    this.snoutTipLen = SNOUT_TIP_LEN * s;
    this.snoutTipLenOpen = SNOUT_OPEN_TIP_LEN * s;
    this.snoutOpenLipOut = SNOUT_OPEN_LIP_OUT * s;
    this.snoutProtrude = SNOUT_OPEN_PROTRUDE * s;
    this.eyeDiam = EYE_DIAM * s;
    this.eyeOffset = EYE_OFFSET * s;
    this.pectoralW = PECTORAL_W * s;
    this.pectoralH = PECTORAL_H * s;
    this.ventralW = VENTRAL_W * s;
    this.ventralH = VENTRAL_H * s;
    this.dorsalCtrlDist = DORSAL_CTRL_DIST * s;
    this.dorsalFinHeight = DORSAL_FIN_HEIGHT * s;
    this.caudalAmp = CAUDAL_AMP * s;
    this.caudalWidthGain = CAUDAL_WIDTH_GAIN * s;
    this.caudalWidthClamp = CAUDAL_WIDTH_CLAMP * s;
  }

  eat(): void {
    this.satedTimer = SATED_DUR;
    this.gulpT = -1; // mouth was held open to feed; let it ease shut
    if (this.curScale < this.maxScale) {
      this.curScale += (this.maxScale - this.curScale) * GROW_FEED_FRAC;
      this.applyScale(this.curScale);
    }
  }

  get sated(): boolean {
    return this.satedTimer > 0;
  }

  // Live snapshot used by the fish-behavior figure's debug overlay (sense
  // radii drawn as rings + a cooldown arc on sated fish). The fields are
  // private so the figure can't poke them; the getter exposes a read-only
  // copy.
  get debug(): {
    avoidRadius: number;
    seekRadius: number;
    satedRemaining: number;
    satedDuration: number;
    wander: Vec2;
    contain: Vec2;
    avoid: Vec2;
    seek: Vec2;
  } {
    return {
      avoidRadius: this.avoidRadius,
      seekRadius: this.seekRadius,
      satedRemaining: Math.max(0, this.satedTimer),
      satedDuration: SATED_DUR,
      wander: { x: this._vWanderX, y: this._vWanderY },
      contain: { x: this._vContainX, y: this._vContainY },
      avoid: { x: this._vAvoidX, y: this._vAvoidY },
      seek: { x: this._vSeekX, y: this._vSeekY },
    };
  }

  // dt in seconds; constants tuned at 60fps so per-tick limits normalize via
  // `f`. `mouse` null = ignore it (e.g. a slow cursor).
  resolve(
    dt: number,
    mouse: Vec2 | null,
    treats: Vec2[],
    width: number,
    height: number,
    worldY: number,
  ): void {
    if (dt <= 0) return;
    this.t += dt;
    if (this.satedTimer > 0) this.satedTimer -= dt;
    const f = dt * TICK_FPS;
    const head = this.spine.joints[0];
    const prev = this.spine.angles[0];
    // Seek from the snout tip — treats are pursued/eaten with the mouth.
    const snout = this.pos(0, 0, this.snoutTipLen);

    // Wander: noise lane is an ABSOLUTE heading. Relative to `prev` it gave a
    // sustained per-frame offset = constant turn rate = endless circling.
    const n = noise1(this.t * HEADING_NOISE_FREQ + this.noisePhaseHeading);
    const wander = fromAngle(n * TWO_PI);
    const wx = wander.x * WANDER_WEIGHT;
    const wy = wander.y * WANDER_WEIGHT;
    this._vWanderX = wx;
    this._vWanderY = wy;
    let dx = wx;
    let dy = wy;

    // Each edge pushes inward, quadratically harder the closer (full strength
    // once past it). Summing edges veers a cornered fish diagonally away.
    const edgePush = (gap: number): number => {
      if (gap >= this.containInset) return 0;
      const t = 1 - Math.max(0, gap) / this.containInset; // 0 at inset, 1 at edge
      return t * t * CONTAIN_GAIN;
    };
    // The vertical edges track the visible window [worldY, worldY+height], so
    // as the camera scrolls the fish migrate to stay on screen.
    const cx =
      edgePush(head.x) - edgePush(width - head.x);
    const cy =
      edgePush(head.y - worldY) - edgePush(worldY + height - head.y);
    this._vContainX = cx;
    this._vContainY = cy;
    dx += cx;
    dy += cy;

    // `prox` in [0,1] = pointer closeness; also drives speed-up/turn below.
    let prox = 0;
    let avx = 0;
    let avy = 0;
    if (mouse) {
      const away = sub(head, mouse);
      const ad = mag(away);
      if (ad < this.avoidRadius && ad > 1e-3) {
        prox = 1 - ad / this.avoidRadius;
        const k = prox * AVOID_STRENGTH;
        avx = (away.x / ad) * k;
        avy = (away.y / ad) * k;
        dx += avx;
        dy += avy;
      }
    }
    this._vAvoidX = avx;
    this._vAvoidY = avy;

    // `seek` in [0,1] = nearest-treat closeness; also drives speed-up/turn.
    let seek = 0;
    let nearest: Vec2 | null = null;
    let nearestD = this.seekRadius;
    if (this.satedTimer <= 0)
      for (const t of treats) {
        const d = mag(sub(t, snout));
        if (d < nearestD) {
          nearestD = d;
          nearest = t;
        }
      }
    let sx = 0;
    let sy = 0;
    if (nearest) {
      seek = 1 - nearestD / this.seekRadius;
      const to = sub(nearest, snout);
      const tl = mag(to) || 1;
      sx = (to.x / tl) * SEEK_WEIGHT;
      sy = (to.y / tl) * SEEK_WEIGHT;
      dx += sx;
      dy += sy;
    }
    this._vSeekX = sx;
    this._vSeekY = sy;

    const desired = heading({ x: dx, y: dy });
    const newHeading = constrainAngle(
      desired,
      prev,
      HEAD_MAX_TURN *
        this.turnRateMult *
        (1 + FLEE_TURN_GAIN * prox + SEEK_TURN_GAIN * seek) *
        f,
    );

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

    // A held ramp toward `target` for the feeding states; idle keeps the
    // sharp open->close pulse.
    const rampMouth = (target: number) => {
      this.mouthOpen +=
        (target - this.mouthOpen) * Math.min(1, dt * MOUTH_HOLD_SMOOTH);
    };
    if (nearest != null && nearestD < this.mouthAnticipDist) {
      // Close enough to feed: hold the mouth wide open until the treat is
      // eaten or gone. Drop any in-progress idle pulse.
      this.gulpT = -1;
      rampMouth(1);
    } else if (nearest != null) {
      // Pursuing a treat but still far: stay shut, and don't let an idle
      // gulp fire mid-chase.
      this.gulpT = -1;
      rampMouth(0);
    } else if (this.gulpT >= 0) {
      // Idle gulp pulse (also the closing chomp after eat()).
      this.gulpT += dt;
      const p = this.gulpT / MOUTH_GULP_DUR;
      if (p >= 1) {
        // Pulse done: shut, schedule the next jittered idle gulp.
        this.mouthOpen = 0;
        this.gulpT = -1;
        this.nextGulpIn =
          MOUTH_IDLE_GAP_MIN +
          (MOUTH_IDLE_GAP_MAX - MOUTH_IDLE_GAP_MIN) *
            noise1(this.t * MOUTH_GAP_NOISE_FREQ + this.noisePhaseMouth);
      } else {
        // 0->1->0 envelope, opening faster than it closes.
        const q =
          p < MOUTH_GULP_OPEN_FRAC
            ? p / MOUTH_GULP_OPEN_FRAC
            : 1 - (p - MOUTH_GULP_OPEN_FRAC) / (1 - MOUTH_GULP_OPEN_FRAC);
        this.mouthOpen = q * q * (3 - 2 * q); // smoothstep
      }
    } else {
      // Idle, mouth shut: ease closed and count down to the next gulp.
      rampMouth(0);
      this.nextGulpIn -= dt;
      if (this.nextGulpIn <= 0) this.gulpT = 0;
    }

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

  // `sunSignX` mirrors the dorsal shadow's horizontal shear with the theme
  // (see SUN_X comment); defaults to the light pond (+1). `segments` controls
  // the per-span Catmull-Rom resolution for caudal + body — overridable so
  // the blog ribbon figure can render a deliberately chunky mesh.
  buildGeometry(sunSignX = 1, segments: number = CURVE_SEGMENTS): FishGeometry {
    const j = this.spine.joints;
    const a = this.spine.angles;

    const headToMid1 = relativeAngleDiff(a[0], a[6]);
    const headToMid2 = relativeAngleDiff(a[0], a[7]);
    const headToTail = headToMid1 + relativeAngleDiff(a[6], a[11]);

    const { base: BASE, fin: FIN } = this.colors;
    const vbuf = this.vbuf;
    const ibuf = this.ibuf;
    let vLen = 0;
    let iLen = 0;

    // `uv` rides index-aligned with `ring`; absent -> NO_UV (flat fin).
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

    // Caudal fin: emitted first so it paints under the body.
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
    emit(catmullRomClosedInto(caudal, segments, this._caudalRing), FIN);
    const bodyIdxStart = iLen;

    // Snout posture: at mouthOpen=0 the lips/tip sit at SNOUT_ANGLE/SNOUT_TIP_LEN
    // (closed mouth, pointed nose). At mouthOpen=1 the lips swing wide, the
    // tip recedes, and the whole mouth telescopes forward along the heading
    // so the pointed nose flattens into the koi "O".
    const mo = this.mouthOpen;
    const protrude = this.snoutProtrude * mo;
    const snout = this._snout;
    snout.sideAngle = SNOUT_ANGLE + (SNOUT_OPEN_ANGLE - SNOUT_ANGLE) * mo;
    snout.sideLenOffset = this.snoutOpenLipOut * mo;
    snout.tipLenOffset =
      this.snoutTipLen + (this.snoutTipLenOpen - this.snoutTipLen) * mo;
    snout.protrudeX = Math.cos(a[0]) * protrude;
    snout.protrudeY = Math.sin(a[0]) * protrude;

    // Single source of truth for the body silhouette + ribbon mesh — same
    // helper the blog figures call. Pooled scratch keeps this allocation-free
    // per frame.
    const mesh = buildBodyMesh(
      j,
      a,
      this.bodyWidth,
      snout,
      segments,
      this._bodyMesh,
    );

    const bodyBase = vLen / FLOATS_PER_VERT;
    const mVerts = mesh.verts;
    const mUVs = mesh.uvs;
    for (let k = 0; k < mVerts.length; k++) {
      const p = mVerts[k];
      const u = mUVs[k];
      vbuf[vLen++] = p.x;
      vbuf[vLen++] = p.y;
      vbuf[vLen++] = BASE[0];
      vbuf[vLen++] = BASE[1];
      vbuf[vLen++] = BASE[2];
      vbuf[vLen++] = BASE[3];
      vbuf[vLen++] = u.x;
      vbuf[vLen++] = u.y;
    }
    const mIdx = mesh.indices;
    for (let k = 0; k < mIdx.length; k++) {
      ibuf[iLen++] = bodyBase + mIdx[k];
    }

    // Dorsal fin: emitted after the body so it paints on top.
    const dorsal = this._dorsal;
    let dw = 0;
    {
      const p = poolAt(dorsal, dw++);
      p.x = j[4].x;
      p.y = j[4].y;
    }
    dw = cubicBezierAppend(j[4], j[5], j[6], j[7], BEZIER_SEGMENTS, dorsal, dw);
    const baseEnd = dw; // dorsal[0..baseEnd) = fin base along the spine (j4->j7)
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

    // Dorsal self-shadow: a vertical fin can't be a flat slab the height mask
    // translates; its shadow is a band PINNED at the spine (zero offset, where
    // the fin meets the back) that fans out to base + sun*scale*finHeight (the
    // top edge projected down-sun). finHeight ~ the gap between the base curve
    // (dorsal[0..baseEnd)) and the outer/top curve (dorsal[baseEnd..dw)). Built
    // here so it paints over the body but under the opaque dorsal.
    const band = this._dorsalShadow;
    const bandUV = this._dorsalShadowUV;
    let bwn = 0;
    const farX: number[] = this._sf0;
    const farY: number[] = this._sf1;
    for (let i = 0; i < baseEnd; i++) {
      const b = dorsal[i];
      let h2 = Infinity;
      for (let k = baseEnd; k < dw; k++) {
        const o = dorsal[k];
        const dx = o.x - b.x;
        const dy = o.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < h2) h2 = d2;
      }
      // Floor the drawn-fin gap with the intrinsic upright arch (see
      // DORSAL_FIN_HEIGHT) so a straight fish still casts a curved-outward
      // band; a turning fish keeps the larger drawn width.
      const t = baseEnd > 1 ? i / (baseEnd - 1) : 0;
      const intrinsic = this.dorsalFinHeight * Math.sin(Math.PI * t);
      const h = Math.max(Math.sqrt(h2), intrinsic) * DORSAL_SHADOW_SCALE;
      // near edge = the fin base on the spine (offset 0).
      const np = poolAt(band, bwn);
      np.x = b.x;
      np.y = b.y;
      const nuv = poolAt(bandUV, bwn);
      nuv.x = SHADOW_UV.x;
      nuv.y = SHADOW_UV.y;
      bwn++;
      farX[i] = b.x + SUN_X * sunSignX * h;
      farY[i] = b.y + SUN_Y * h;
    }
    for (let i = baseEnd - 1; i >= 0; i--) {
      const fp = poolAt(band, bwn);
      fp.x = farX[i];
      fp.y = farY[i];
      const fuv = poolAt(bandUV, bwn);
      fuv.x = SHADOW_UV.x;
      fuv.y = SHADOW_UV.y;
      bwn++;
    }
    if (band.length > bwn) band.length = bwn;
    if (bandUV.length > bwn) bandUV.length = bwn;
    const shadowIdxStart = iLen;
    emit(band, [0, 0, 0, DORSAL_SHADOW_ALPHA], bandUV);

    const dorsalIdxStart = iLen;
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
    geo.bodyIdxStart = bodyIdxStart;
    geo.shadowIdxStart = shadowIdxStart;
    geo.dorsalIdxStart = dorsalIdxStart;
    geo.finCount = finLen;
    geo.eyeCount = eyeLen;
    return geo;
  }
}
