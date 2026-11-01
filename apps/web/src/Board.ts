import { Application, Circle, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { CHARACTER_BY_ID, getScenario } from '@deadbolt/engine';
import type { GameEvent, GameState, ZombieType, ZoneId } from '@deadbolt/engine';

export const CELL_W = 190;
export const CELL_H = 132;
const GAP = 8;

export type ZoneHint = 'move' | 'attack';
export interface Hints {
  zones: Record<ZoneId, ZoneHint | undefined>;
  /** Door edge ids the active survivor can open right now. */
  doors: Record<string, boolean>;
}
export interface HoverTarget { kind: 'survivor' | 'zombie' | 'door' | 'marker' | 'truck'; id: string }
export interface BoardCallbacks {
  onHover(t: HoverTarget | null, x: number, y: number, sticky?: boolean): void;
  onZone(id: ZoneId): void;
  onDoor(edgeId: string, a: ZoneId, b: ZoneId): void;
}

export const SURVIVOR_COLORS: Record<string, number> = {
  dana: 0x4f9dff, ray: 0xe8743b, lena: 0xb980f0, amara: 0x3ecf8e, jonah: 0xf2c94c, hannah: 0xf06292,
};
const ZOMBIE_COLORS: Record<ZombieType, number> = {
  shambler: 0x7cb342, sprinter: 0xd4e157, brute: 0x33691e, mutant: 0x8e24aa,
};

interface Tok { c: Container; x: number; y: number; dying: boolean; spawn: number }
interface Float { t: Text; age: number; life: number; vy: number }
interface Ring { g: Graphics; age: number; x: number; y: number }

const zx = (col: number): number => 14 + col * (CELL_W + GAP);
const zy = (row: number): number => 14 + row * (CELL_H + GAP);

function label(text: string, size: number, fill: number, bold = false): Text {
  return new Text({ text, style: { fontFamily: 'system-ui, sans-serif', fontSize: size, fill, fontWeight: bold ? '700' : '400' } });
}

export class BoardView {
  private app = new Application();
  private world = new Container();
  private bg = new Graphics();
  private doorLayer = new Container();
  private labelLayer = new Container();
  private tokenLayer = new Container();
  private fx = new Container();
  private zoneHit = new Map<ZoneId, Container>();
  private zoneText = new Map<ZoneId, Text>();
  private doorHit = new Map<string, Container>();
  private markers = new Map<ZoneId, Container>();
  private survivors = new Map<string, Tok>();
  private zombies = new Map<string, Tok>();
  private floats: Float[] = [];
  private rings: Ring[] = [];
  private activeId: string | null = null;
  private time = 0;
  private scenarioId = '';
  private cb!: BoardCallbacks;
  private lastState!: GameState;
  private destroyed = false;
  private worldW = 0;
  private worldH = 0;

  static async create(host: HTMLElement, cb: BoardCallbacks, state: GameState): Promise<BoardView> {
    const v = new BoardView();
    await v.init(host, cb, state);
    return v;
  }

  private async init(host: HTMLElement, cb: BoardCallbacks, state: GameState): Promise<void> {
    this.cb = cb;
    this.lastState = state;
    await this.app.init({
      background: 0x12151b, antialias: true, resizeTo: host,
      resolution: window.devicePixelRatio || 1, autoDensity: true,
    });
    if (this.destroyed) { this.app.destroy(true); return; }
    host.appendChild(this.app.canvas);
    this.bindGestures(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.bg, this.labelLayer, this.doorLayer, this.tokenLayer, this.fx);

    const sc = getScenario(state.scenarioId);
    this.scenarioId = sc.id;
    const cols = Math.max(...sc.zones.map((z) => z.col)) + 1;
    const rows = Math.max(...sc.zones.map((z) => z.row)) + 1;
    this.worldW = zx(cols) ;
    this.worldH = zy(rows);

    for (const z of sc.zones) {
      const hit = new Container();
      hit.hitArea = new Rectangle(zx(z.col), zy(z.row), CELL_W, CELL_H);
      hit.eventMode = 'static';
      hit.on('pointertap', () => { if (!this.dragged) cb.onZone(z.id); });
      this.labelLayer.addChild(hit);
      this.zoneHit.set(z.id, hit);
      const t = label(z.name.toUpperCase(), 12, 0x9aa4b2, true);
      t.position.set(zx(z.col) + 10, zy(z.row) + 8);
      this.labelLayer.addChild(t);
      this.zoneText.set(z.id, t);
      const m = new Container();
      m.position.set(zx(z.col) + CELL_W - 22, zy(z.row) + 22);
      m.hitArea = new Rectangle(-14, -14, 28, 28);
      this.hoverable(m, () => (this.lastState.objectives[z.id] ? { kind: 'marker', id: z.id } : null));
      this.labelLayer.addChild(m);
      this.markers.set(z.id, m);
    }
    for (const e of sc.edges) {
      if (!e.door) continue;
      const a = sc.zones.find((z) => z.id === e.a)!;
      const b = sc.zones.find((z) => z.id === e.b)!;
      const { x, y, horizontal } = doorPos(a.col, a.row, b.col, b.row);
      const hit = new Container();
      const hw = horizontal ? 56 : 18;
      const hh = horizontal ? 18 : 56;
      hit.hitArea = new Rectangle(x - hw / 2, y - hh / 2, hw, hh);
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.on('pointertap', () => { if (!this.dragged) cb.onDoor(e.id, e.a, e.b); });
      this.hoverable(hit, () => ({ kind: 'door', id: e.id }));
      hit.cursor = 'pointer';
      this.doorLayer.addChild(hit);
      this.doorHit.set(e.id, hit);
    }

    this.fit();
    window.addEventListener('resize', this.fit);
    new ResizeObserver(() => this.fit()).observe(host);
    this.app.ticker.add((tk) => this.tick(tk.deltaTime));
    this.update(state, { zones: {}, doors: {} }, [], true);
  }

  private hoverable(c: Container, target: () => HoverTarget | null): void {
    c.eventMode = 'static';
    c.cursor = 'help';
    type Ev = { clientX: number; clientY: number; pointerType?: string };
    const show = (e: Ev) => { if (e.pointerType !== 'touch') this.cb.onHover(target(), e.clientX, e.clientY); };
    c.on('pointerover', show);
    c.on('pointermove', show);
    c.on('pointerout', (e: Ev) => { if (e.pointerType !== 'touch') this.cb.onHover(null, 0, 0); });
    // On touch screens a tap pins the tooltip until the next touch.
    c.on('pointertap', (e: Ev) => { if (e.pointerType === 'touch' && !this.dragged) this.cb.onHover(target(), e.clientX, e.clientY, true); });
  }

  // ---------- pan and zoom ----------

  private zoom = 1;
  private base = 1;
  private baseX = 0;
  private baseY = 0;
  private panX = 0;
  private panY = 0;
  dragged = false;

  private applyView(): void {
    const w = this.app.screen.width, h = this.app.screen.height;
    const s = this.base * this.zoom;
    const sw = this.worldW * s, sh = this.worldH * s;
    const clamp = (v: number, size: number, view: number) => {
      if (size <= view) return (view - size) / 2;
      return Math.min(0, Math.max(view - size, v));
    };
    const x = clamp(this.baseX + this.panX, sw, w);
    const y = clamp(this.baseY + this.panY, sh, h);
    this.panX = x - this.baseX;
    this.panY = y - this.baseY;
    this.world.scale.set(s);
    this.world.position.set(x, y);
  }

  /** Zoom by `f` keeping the screen point (px, py) still. */
  zoomBy(f: number, px = this.app.screen.width / 2, py = this.app.screen.height / 2): void {
    const z = Math.min(4, Math.max(1, this.zoom * f));
    const s1 = this.base * this.zoom, s2 = this.base * z;
    const wx = (px - this.world.position.x) / s1, wy = (py - this.world.position.y) / s1;
    this.zoom = z;
    this.panX = px - wx * s2 - this.baseX;
    this.panY = py - wy * s2 - this.baseY;
    this.applyView();
  }

  resetView(): void {
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.applyView();
  }

  private bindGestures(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = 'none';
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let lastDist = 0;
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, local(e));
      moved = 0;
      lastDist = 0;
      this.dragged = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const cur = local(e);
      if (pts.size === 1) {
        moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
        if (moved > 8) {
          this.dragged = true;
          this.panX += cur.x - prev.x;
          this.panY += cur.y - prev.y;
          this.applyView();
        }
      } else if (pts.size === 2) {
        pts.set(e.pointerId, cur);
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (lastDist > 0) this.zoomBy(d / lastDist, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        lastDist = d;
        this.dragged = true;
        return;
      }
      pts.set(e.pointerId, cur);
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      lastDist = 0;
      setTimeout(() => { if (pts.size === 0) this.dragged = false; }, 0);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = local(e as unknown as PointerEvent);
      this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('dblclick', () => this.resetView());
  }

  private fit = (): void => {
    if (!this.app.renderer) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (!this.worldW) return;
    const s = Math.min(w / this.worldW, h / this.worldH);
    this.base = s;
    this.baseX = (w - this.worldW * s) / 2;
    this.baseY = (h - this.worldH * s) / 2;
    this.applyView();
  };

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('resize', this.fit);
    try { this.app.destroy(true, { children: true }); } catch { /* not initialised yet */ }
  }

  // ---------- drawing ----------

  update(state: GameState, hints: Hints, events: GameEvent[], instant = false): void {
    if (this.destroyed || !this.app.renderer) return;
    const sc = getScenario(state.scenarioId);
    this.lastState = state;
    this.activeId = state.turn?.survivorId ?? null;
    const g = this.bg;
    g.clear();

    for (const z of sc.zones) {
      const x = zx(z.col), y = zy(z.row);
      const fill = z.kind === 'street' ? 0x2b303a : z.kind === 'yard' ? 0x24382c : 0x232a36;
      g.roundRect(x, y, CELL_W, CELL_H, 10).fill(fill);
      g.roundRect(x, y, CELL_W, CELL_H, 10).stroke({ width: 2, color: z.kind === 'room' ? 0x3b4556 : 0x343b48 });
      if (z.spawn) {
        const on = !z.spawn.afterBuilding || state.filled[z.spawn.afterBuilding];
        g.roundRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8, 8).stroke({ width: 2, color: on ? 0xc0392b : 0x5b3a37, alpha: 0.8 });
      }
      const hint = hints.zones[z.id];
      if (hint) {
        const col = hint === 'move' ? 0x4fc3f7 : 0xff5252;
        g.roundRect(x, y, CELL_W, CELL_H, 10).fill({ color: col, alpha: 0.13 });
        g.roundRect(x + 1, y + 1, CELL_W - 2, CELL_H - 2, 10).stroke({ width: 3, color: col });
      }
      const hit = this.zoneHit.get(z.id)!;
      hit.cursor = hint ? 'pointer' : 'default';
      const noise = state.noise[z.id] ?? 0;
      if (noise > 0) {
        for (let i = 0; i < Math.min(noise, 6); i++) {
          g.circle(x + 18 + i * 14, y + CELL_H - 14, 4).fill(0xffb300);
        }
      }
      this.drawMarker(z.id, state);
      if (z.id === sc.exitZone) this.drawTruck(g, x, y, state);
    }

    for (const e of sc.edges) {
      if (!e.door) continue;
      const a = sc.zones.find((z) => z.id === e.a)!;
      const b = sc.zones.find((z) => z.id === e.b)!;
      const { x, y, horizontal } = doorPos(a.col, a.row, b.col, b.row);
      const open = !!state.doors[e.id];
      const w = horizontal ? 44 : 8;
      const h = horizontal ? 8 : 44;
      if (open) {
        g.roundRect(x - w / 2, y - h / 2, w, h, 3).stroke({ width: 2, color: 0x66bb6a });
      } else {
        g.roundRect(x - w / 2, y - h / 2, w, h, 3).fill(0x9a6a33).stroke({ width: 1, color: 0x5d3d17 });
      }
      if (hints.doors[e.id]) {
        g.circle(x, y, 20).stroke({ width: 3, color: 0xffb74d });
      }
    }

    this.syncTokens(state, instant);
    this.playEvents(events);
  }

  private truckLabel?: Text;
  private truckHit?: Container;
  private drawTruck(g: Graphics, x: number, y: number, state: GameState): void {
    const ready = state.team.keys && state.team.fuel;
    const body = ready ? 0x43a047 : 0x6b7280;
    const cx = x + CELL_W / 2 - 40, cy = y + 90;
    g.roundRect(cx, cy, 56, 30, 4).fill(body);
    g.roundRect(cx + 56, cy + 9, 24, 21, 4).fill(body);
    g.rect(cx + 62, cy + 13, 12, 8).fill(0x12151b);
    g.circle(cx + 14, cy + 32, 7).fill(0x12151b).stroke({ width: 2, color: 0x9aa4b2 });
    g.circle(cx + 66, cy + 32, 7).fill(0x12151b).stroke({ width: 2, color: 0x9aa4b2 });
    if (!this.truckLabel) {
      this.truckLabel = label('', 12, 0xffffff, true);
      this.truckLabel.anchor.set(0.5, 0);
      this.labelLayer.addChild(this.truckLabel);
    }
    if (!this.truckHit) {
      this.truckHit = new Container();
      this.truckHit.hitArea = new Rectangle(cx - 4, cy - 2, 92, 46);
      this.hoverable(this.truckHit, () => ({ kind: 'truck', id: 'truck' }));
      this.labelLayer.addChild(this.truckHit);
    }
    this.truckLabel.text = ready ? 'TRUCK: all aboard, then Start' : 'EXIT: the truck';
    this.truckLabel.style.fill = ready ? 0xa5d6a7 : 0xcfd8dc;
    this.truckLabel.position.set(x + CELL_W / 2, y + 28);
  }

  private drawMarker(zoneId: ZoneId, state: GameState): void {
    const m = this.markers.get(zoneId)!;
    m.removeChildren();
    const tok = state.objectives[zoneId];
    if (!tok) return;
    const ch = tok.hidden ? '?' : tok.kind === 'fuel' ? 'F' : tok.kind === 'keys' ? 'K' : 'S';
    const color = tok.hidden ? 0xffd54f : tok.kind === 'fuel' ? 0xff7043 : tok.kind === 'keys' ? 0x4dd0e1 : 0x9ccc65;
    const g = new Graphics().roundRect(-13, -13, 26, 26, 6).fill(color);
    const t = label(ch, 17, 0x1b1b1b, true);
    t.anchor.set(0.5);
    m.addChild(g, t);
  }

  private makeSurvivor(id: string, charId: string): Tok {
    const c = new Container();
    const ring = new Graphics().circle(0, 0, 21).stroke({ width: 3, color: 0xffffff });
    ring.label = 'ring';
    ring.visible = false;
    const body = new Graphics().circle(0, 0, 15).fill(SURVIVOR_COLORS[charId] ?? 0xcccccc).stroke({ width: 2, color: 0x10131a });
    const t = label((CHARACTER_BY_ID[charId]?.name ?? id).slice(0, 1), 15, 0x10131a, true);
    t.anchor.set(0.5);
    const badge = label('', 10, 0xff5252, true);
    badge.label = 'badge';
    badge.anchor.set(0.5, 0);
    badge.position.set(0, 14);
    c.addChild(ring, body, t, badge);
    c.hitArea = new Circle(0, 0, 18);
    this.hoverable(c, () => ({ kind: 'survivor', id }));
    this.tokenLayer.addChild(c);
    return { c, x: 0, y: 0, dying: false, spawn: 0 };
  }

  private makeZombie(id: string, type: ZombieType): Tok {
    const c = new Container();
    const g = new Graphics();
    const col = ZOMBIE_COLORS[type];
    if (type === 'shambler') g.circle(0, 0, 11).fill(col);
    else if (type === 'sprinter') g.poly([0, -13, 12, 10, -12, 10]).fill(col);
    else if (type === 'brute') g.roundRect(-14, -14, 28, 28, 5).fill(col);
    else g.poly([0, -20, 18, -8, 18, 8, 0, 20, -18, 8, -18, -8]).fill(col);
    g.stroke({ width: 2, color: 0x0d1008 });
    c.addChild(g);
    if (type === 'sprinter' || type === 'brute' || type === 'mutant') {
      const t = label(type === 'sprinter' ? 'R' : type === 'brute' ? 'B' : 'M', 11, 0x101010, true);
      t.anchor.set(0.5);
      t.position.set(0, type === 'sprinter' ? 3 : 0);
      c.addChild(t);
    }
    c.hitArea = new Circle(0, 0, 16);
    this.hoverable(c, () => ({ kind: 'zombie', id }));
    this.tokenLayer.addChild(c);
    return { c, x: 0, y: 0, dying: false, spawn: 0 };
  }

  private syncTokens(state: GameState, instant: boolean): void {
    const sc = getScenario(state.scenarioId);
    const byZone = new Map<ZoneId, { sv: string[]; zb: string[] }>();
    const slot = (z: ZoneId) => {
      let s = byZone.get(z);
      if (!s) { s = { sv: [], zb: [] }; byZone.set(z, s); }
      return s;
    };
    for (const id of state.turnOrder) {
      const sv = state.survivors[id]!;
      if (sv.alive) slot(sv.zone).sv.push(id);
    }
    const order: ZombieType[] = ['mutant', 'brute', 'sprinter', 'shambler'];
    const zs = [...state.zombies].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    for (const z of zs) slot(z.zone).zb.push(z.id);

    const seenS = new Set<string>();
    const seenZ = new Set<string>();
    for (const [zoneId, { sv, zb }] of byZone) {
      const zd = sc.zones.find((z) => z.id === zoneId)!;
      const ox = zx(zd.col), oy = zy(zd.row);
      sv.forEach((id, i) => {
        seenS.add(id);
        let tok = this.survivors.get(id);
        if (!tok) {
          tok = this.makeSurvivor(id, state.survivors[id]!.charId);
          this.survivors.set(id, tok);
          tok.c.position.set(ox + 24, oy + 56);
          tok.x = tok.c.x; tok.y = tok.c.y;
        }
        tok.x = ox + 26 + (i % 5) * 35;
        tok.y = oy + 54 + Math.floor(i / 5) * 36;
        const badge = tok.c.getChildByLabel('badge') as Text;
        const w = state.survivors[id]!.slots.filter((c) => c?.item === 'wound').length;
        badge.text = w > 0 ? 'W'.repeat(w) : '';
        if (instant) tok.c.position.set(tok.x, tok.y);
      });
      const svRows = Math.ceil(sv.length / 5);
      zb.forEach((id, i) => {
        seenZ.add(id);
        let tok = this.zombies.get(id);
        const z = state.zombies.find((q) => q.id === id)!;
        if (!tok) {
          tok = this.makeZombie(id, z.type);
          this.zombies.set(id, tok);
          tok.spawn = instant ? 1 : 0.01;
          tok.c.scale.set(tok.spawn);
          tok.c.position.set(ox + 30 + (i % 7) * 24, oy + 54 + svRows * 36 + 6 + Math.floor(i / 7) * 26);
          tok.x = tok.c.x; tok.y = tok.c.y;
        }
        tok.x = ox + 24 + (i % 7) * 24;
        tok.y = oy + 56 + svRows * 36 + 4 + Math.floor(i / 7) * 26;
        if (instant) tok.c.position.set(tok.x, tok.y);
      });
    }
    for (const [id, tok] of this.survivors) {
      if (!seenS.has(id)) { tok.dying = true; tok.c.alpha = 0.99; }
    }
    for (const [id, tok] of this.zombies) {
      if (!seenZ.has(id)) tok.dying = true;
    }
  }

  // ---------- effects ----------

  private zoneCenter(zone: ZoneId): { x: number; y: number } {
    const zd = getScenario(this.scenarioId).zones.find((z) => z.id === zone)!;
    return { x: zx(zd.col) + CELL_W / 2, y: zy(zd.row) + CELL_H / 2 };
  }

  private float(zone: ZoneId, text: string, color: number, dy = 0): void {
    const { x, y } = this.zoneCenter(zone);
    const t = label(text, 15, color, true);
    t.anchor.set(0.5);
    t.position.set(x + (Math.random() - 0.5) * 40, y + dy);
    this.fx.addChild(t);
    this.floats.push({ t, age: 0, life: 70, vy: -0.7 });
  }

  private ring(zone: ZoneId): void {
    const { x, y } = this.zoneCenter(zone);
    const g = new Graphics();
    this.fx.addChild(g);
    this.rings.push({ g, age: 0, x, y });
  }

  private playEvents(events: GameEvent[]): void {
    let delay = 0;
    const later = (fn: () => void) => { setTimeout(fn, delay); delay += 70; };
    for (const e of events) {
      const type = e.type;
      if (type === 'attack') {
        const rolls = (e['rolls'] as number[]).join(' ');
        later(() => this.float(e['target'] as string, `d6: ${rolls}  (hit ${e['needs']}+)`, 0xffffff, -34));
      } else if (type === 'zombie_killed') {
        later(() => this.float(e['zone'] as string, 'KILL', 0xffee58));
      } else if (type === 'wounded') {
        const sv = this.survivors.get(e['survivor'] as string);
        later(() => { if (sv) this.floatAt(sv.x, sv.y - 24, 'WOUND', 0xff5252); });
      } else if (type === 'wound_prevented') {
        const sv = this.survivors.get(e['survivor'] as string);
        later(() => { if (sv) this.floatAt(sv.x, sv.y - 24, 'BLOCKED', 0x80cbc4); });
      } else if (type === 'survivor_died') {
        later(() => this.float(e['zone'] as string, 'DOWN', 0xff1744));
      } else if (type === 'noise') {
        later(() => this.ring(e['zone'] as string));
      } else if (type === 'level_up') {
        const sv = this.survivors.get(e['survivor'] as string);
        later(() => { if (sv) this.floatAt(sv.x, sv.y - 28, 'LEVEL UP', 0xffd54f); });
      } else if (type === 'building_opened') {
        later(() => undefined);
      } else if (type === 'zombie_attacked') {
        const sv = this.survivors.get(e['target'] as string);
        later(() => { if (sv) this.floatAt(sv.x, sv.y - 20, 'bite', 0xef9a9a); });
      }
    }
  }

  private floatAt(x: number, y: number, text: string, color: number): void {
    const t = label(text, 14, color, true);
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.fx.addChild(t);
    this.floats.push({ t, age: 0, life: 60, vy: -0.8 });
  }

  private tick(dt: number): void {
    this.time += dt;
    const k = Math.min(1, 0.2 * dt);
    for (const tok of this.survivors.values()) {
      tok.c.x += (tok.x - tok.c.x) * k;
      tok.c.y += (tok.y - tok.c.y) * k;
      if (tok.dying) tok.c.alpha = Math.max(0, tok.c.alpha - 0.03 * dt);
    }
    for (const [id, tok] of this.survivors) {
      const ring = tok.c.getChildByLabel('ring');
      if (ring) {
        ring.visible = id === this.activeId;
        ring.alpha = 0.55 + 0.45 * Math.sin(this.time / 8);
      }
      if (tok.dying && tok.c.alpha <= 0) { tok.c.destroy({ children: true }); this.survivors.delete(id); }
    }
    for (const [id, tok] of this.zombies) {
      tok.c.x += (tok.x - tok.c.x) * k;
      tok.c.y += (tok.y - tok.c.y) * k;
      if (tok.dying) {
        const s = tok.c.scale.x - 0.09 * dt;
        if (s <= 0.05) { tok.c.destroy({ children: true }); this.zombies.delete(id); } else tok.c.scale.set(s);
      } else if (tok.c.scale.x < 1) {
        tok.c.scale.set(Math.min(1, tok.c.scale.x + 0.08 * dt));
      }
    }
    for (const f of this.floats) {
      f.age += dt;
      f.t.y += f.vy * dt;
      f.t.alpha = Math.max(0, 1 - f.age / f.life);
    }
    this.floats = this.floats.filter((f) => {
      if (f.age >= f.life) { f.t.destroy(); return false; }
      return true;
    });
    for (const r of this.rings) {
      r.age += dt;
      const p = r.age / 40;
      r.g.clear().circle(r.x, r.y, 10 + p * 70).stroke({ width: 3, color: 0xffb300, alpha: Math.max(0, 1 - p) });
    }
    this.rings = this.rings.filter((r) => {
      if (r.age >= 40) { r.g.destroy(); return false; }
      return true;
    });
  }
}

function doorPos(ac: number, ar: number, bc: number, br: number): { x: number; y: number; horizontal: boolean } {
  if (ac === bc) {
    // vertical neighbours: door sits on the horizontal border between them
    const row = Math.max(ar, br);
    return { x: zx(ac) + CELL_W / 2, y: zy(row) - GAP / 2, horizontal: true };
  }
  const col = Math.max(ac, bc);
  return { x: zx(col) - GAP / 2, y: zy(ar) + CELL_H / 2, horizontal: false };
}
