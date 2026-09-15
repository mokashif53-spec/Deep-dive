import { LW, BOOST_DURATION } from "./constants";
import { clamp, damp, TAU } from "./utils";

/**
 * Player controller + renderer.
 * "Finn" - a cute, funky little shark seen from a rear / three-quarter top
 * perspective: nose points to the TOP of the screen (forward, deeper),
 * the big tail is at the bottom (closest to the camera).
 *
 * World convention: worldY increases as the player dives forward.
 */
export class Player {
  x = LW / 2;
  targetX = LW / 2;
  vx = 0;
  worldY = 0;
  speed = 150;
  yaw = 0;
  bank = 0;
  tailPhase = 0;
  finPhase = 0;
  time = 0;
  stretch = 0; // body stretch when boosting (0..1)

  boostActive = false;
  boostTimer = 0;
  boostCooldown = 0;
  boostGlow = 0;

  dead = false;
  deathT = 0;
  deathRot = 0;
  deathVx = 0;
  deathDrift = 0;
  deathSpinDir = 1;

  reset() {
    this.x = LW / 2;
    this.targetX = LW / 2;
    this.vx = 0;
    this.worldY = 0;
    this.speed = 150;
    this.yaw = 0;
    this.bank = 0;
    this.stretch = 0;
    this.boostActive = false;
    this.boostTimer = 0;
    this.boostCooldown = 0;
    this.boostGlow = 0;
    this.dead = false;
    this.deathT = 0;
    this.deathRot = 0;
    this.deathDrift = 0;
    this.deathVx = 0;
  }

  get canBoost() {
    return !this.boostActive && this.boostCooldown <= 0 && !this.dead;
  }

  startBoost() {
    this.boostActive = true;
    this.boostTimer = BOOST_DURATION;
    this.boostGlow = 1;
  }

  endBoost() {
    this.boostActive = false;
    this.boostTimer = 0;
    this.boostCooldown = 4.0;
  }

  kill(impactDir: number) {
    this.dead = true;
    this.deathT = 0;
    this.deathRot = 0;
    this.deathSpinDir = impactDir >= 0 ? 1 : -1;
    this.deathVx = -impactDir * 90;
    this.boostActive = false;
    this.boostTimer = 0;
    this.boostGlow = 0;
  }

  update(dt: number, targetSpeed: number, steering: boolean) {
    this.time += dt;

    if (this.dead) {
      this.deathT += dt;
      const t = this.deathT;
      const spin = t < 0.9 ? 11 * (1 - t / 0.9) + 2 : Math.max(0, 2 - (t - 0.9) * 3);
      this.deathRot += spin * this.deathSpinDir * dt;
      this.x += this.deathVx * dt;
      this.deathVx = damp(this.deathVx, 0, 3, dt);
      this.deathDrift += (t < 1.1 ? 110 : 20) * dt;
      this.speed = damp(this.speed, 0, 3.2, dt);
      this.x = clamp(this.x, 20, LW - 20);
      this.tailPhase += dt * 2;
      this.stretch = damp(this.stretch, 0, 8, dt);
      return;
    }

    if (this.boostActive) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) this.endBoost();
    } else if (this.boostCooldown > 0) {
      this.boostCooldown = Math.max(0, this.boostCooldown - dt);
    }
    this.boostGlow = damp(this.boostGlow, this.boostActive ? 1 : 0, this.boostActive ? 14 : 6, dt);
    this.stretch = damp(this.stretch, this.boostActive ? 1 : 0, 8, dt);

    this.speed = damp(this.speed, targetSpeed, this.boostActive ? 6 : 3.2, dt);

    const stiffness = steering ? 55 : 30;
    const damping = steering ? 11 : 9;
    const ax = (this.targetX - this.x) * stiffness - this.vx * damping;
    this.vx += ax * dt;
    const maxV = 560;
    this.vx = clamp(this.vx, -maxV, maxV);
    this.x += this.vx * dt;
    const margin = 22;
    if (this.x < margin) {
      this.x = margin;
      this.vx *= -0.2;
    } else if (this.x > LW - margin) {
      this.x = LW - margin;
      this.vx *= -0.2;
    }

    const yawTarget = Math.atan2(this.vx, this.speed + 200) * 0.9;
    this.yaw = damp(this.yaw, yawTarget, 9, dt);
    this.bank = damp(this.bank, clamp(this.vx / 560, -1, 1), 7, dt);

    const tailRate = 7 + this.speed / 45 + (this.boostActive ? 8 : 0);
    this.tailPhase += tailRate * dt;
    this.finPhase += 3 * dt;
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  draw(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
    ctx.save();
    ctx.translate(sx, sy + (this.dead ? this.deathDrift : 0));

    const st = this.stretch;
    if (this.dead) {
      const shrink = 1 - clamp((this.deathT - 0.6) / 1.4, 0, 0.25);
      ctx.rotate(this.deathRot);
      ctx.scale(shrink, shrink);
    } else {
      ctx.rotate(this.yaw);
      ctx.scale((1 - Math.abs(this.bank) * 0.16) * (1 - st * 0.06), 1 + st * 0.09);
    }

    const bank = this.dead ? 0 : this.bank;
    const swing = Math.sin(this.tailPhase) * (this.dead ? 0.15 : 0.5);
    const wiggle = Math.sin(this.tailPhase - 1.2) * (this.dead ? 0 : 0.06);
    const finFlap = Math.sin(this.finPhase) * 0.1 + st * 0.2;

    // ---- boost aura ----
    if (this.boostGlow > 0.02) {
      const g = this.boostGlow;
      const grad = ctx.createRadialGradient(0, 4, 8, 0, 4, 82);
      grad.addColorStop(0, `rgba(160,255,255,${0.6 * g})`);
      grad.addColorStop(0.4, `rgba(80,210,255,${0.32 * g})`);
      grad.addColorStop(0.75, `rgba(255,220,90,${0.12 * g})`);
      grad.addColorStop(1, "rgba(30,120,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 4, 60 + Math.sin(this.time * 30) * 4, 88, 0, 0, TAU);
      ctx.fill();
    }

    // ---- soft shadow ----
    ctx.fillStyle = "rgba(0,20,50,0.22)";
    ctx.beginPath();
    ctx.ellipse(5, 14, 17, 42, 0, 0, TAU);
    ctx.fill();

    // ---- TAIL (oversized, orange with yellow tips) ----
    ctx.save();
    ctx.translate(0, 32);
    ctx.rotate(swing + wiggle * 2);
    const tailGrad = ctx.createLinearGradient(0, 0, 0, 34);
    tailGrad.addColorStop(0, "#ff8a3d");
    tailGrad.addColorStop(0.7, "#ffb347");
    tailGrad.addColorStop(1, "#ffe066");
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.bezierCurveTo(12, 2, 26, 14, 24, 34); // big upper lobe (right)
    ctx.bezierCurveTo(14, 26, 6, 18, 0, 16);
    ctx.bezierCurveTo(-5, 18, -13, 24, -17, 30); // smaller lobe (left)
    ctx.bezierCurveTo(-19, 14, -10, 4, 0, -4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // tail rays
    ctx.strokeStyle = "rgba(200,80,20,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.quadraticCurveTo(6 + i * 4, 12, 10 + i * 5, 26 - i * 2);
      ctx.stroke();
    }
    ctx.restore();

    // ---- PECTORAL FINS (orange → yellow, translucent edge) ----
    const drawPectoral = (side: 1 | -1) => {
      ctx.save();
      ctx.translate(side * 14, -2);
      ctx.rotate(side * (finFlap + bank * 0.25 * side));
      const fg = ctx.createLinearGradient(0, 0, side * 28, 16);
      fg.addColorStop(0, "#ff7f3f");
      fg.addColorStop(0.6, "#ffb347");
      fg.addColorStop(1, "#ffe680");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(side * 24, -4, side * 30, 18);
      ctx.quadraticCurveTo(side * 14, 12, 0, 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = "rgba(200,80,20,0.3)";
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * 12 * i, 2 * i, side * (10 + 9 * i), 14 + i);
        ctx.stroke();
      }
      ctx.restore();
    };
    drawPectoral(-1);
    drawPectoral(1);

    // ---- BODY (turquoise, counter-shaded) ----
    ctx.save();
    ctx.rotate(wiggle);
    const bodyGrad = ctx.createLinearGradient(-19, 0, 19, 0);
    bodyGrad.addColorStop(0, "#0e8fb3");
    bodyGrad.addColorStop(0.4, "#3fe0d6");
    bodyGrad.addColorStop(0.6, "#3fe0d6");
    bodyGrad.addColorStop(1, "#0b83a8");
    ctx.fillStyle = bodyGrad;
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.bezierCurveTo(15, -40, 20, -18, 18, -2);
      ctx.bezierCurveTo(17, 14, 10, 28, 4, 35);
      ctx.lineTo(-4, 35);
      ctx.bezierCurveTo(-10, 28, -17, 14, -18, -2);
      ctx.bezierCurveTo(-20, -18, -15, -40, 0, -44);
      ctx.closePath();
    };
    bodyPath();
    ctx.fill();

    // back pattern: pale mint saddle stripes + yellow glowing lateral line
    ctx.save();
    bodyPath();
    ctx.clip();
    ctx.fillStyle = "rgba(200,255,245,0.35)";
    for (let i = 0; i < 3; i++) {
      const y = -14 + i * 13;
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.quadraticCurveTo(0, y - 7, 20, y);
      ctx.quadraticCurveTo(0, y - 1, -20, y);
      ctx.fill();
    }
    // darker head cap
    const cap = ctx.createLinearGradient(0, -44, 0, -18);
    cap.addColorStop(0, "rgba(10,110,150,0.55)");
    cap.addColorStop(1, "rgba(10,110,150,0)");
    ctx.fillStyle = cap;
    ctx.fillRect(-22, -46, 44, 30);
    // funky yellow spots near tail
    ctx.fillStyle = "rgba(255,225,90,0.9)";
    for (const [px, py, r] of [[-7, 20, 2.2], [6, 24, 1.8], [-2, 29, 1.5], [9, 14, 1.4]]) {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, TAU);
      ctx.fill();
    }
    // glowing lateral lines (left/right edges)
    const glowA = 0.5 + this.boostGlow * 0.5 + Math.sin(this.time * 4) * 0.1;
    ctx.strokeStyle = `rgba(255,240,120,${glowA})`;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = "rgba(255,240,120,0.9)";
    ctx.shadowBlur = 6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 13, -22);
      ctx.quadraticCurveTo(s * 17, 0, s * 9, 26);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    // spine highlight
    ctx.strokeStyle = "rgba(230,255,255,0.45)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -36);
    ctx.quadraticCurveTo(1, -12, 0, 8);
    ctx.stroke();

    // gill slits
    ctx.strokeStyle = "rgba(6,70,100,0.5)";
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 3; i++) {
      const y = -15 + i * 4;
      ctx.beginPath();
      ctx.arc(15, y, 4, Math.PI * 0.9, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-15, y, 4, Math.PI * 1.5, Math.PI * 2.1);
      ctx.stroke();
    }

    // ---- DORSAL FIN (purple/pink, points back toward camera) ----
    const dg = ctx.createLinearGradient(0, -8, 0, 24);
    dg.addColorStop(0, "#d27bff");
    dg.addColorStop(1, "#7c3ad6");
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(-3.5, -8);
    ctx.quadraticCurveTo(bank * 5 - 2, 4, bank * 10 + 1, 24);
    ctx.quadraticCurveTo(bank * 5 + 3, 8, 3.5, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,200,255,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-3.5, -8);
    ctx.quadraticCurveTo(bank * 5 - 2, 4, bank * 10 + 1, 24);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(bank * 3, 2, 1.3, 0, TAU);
    ctx.fill();
    ctx.restore(); // wiggle

    // ---- EYES (big & expressive) ----
    const drawEye = (side: 1 | -1) => {
      const ex = side * 10;
      const ey = -26;
      if (this.dead) {
        ctx.strokeStyle = "#0b4a66";
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ex - 4, ey - 4);
        ctx.lineTo(ex + 4, ey + 4);
        ctx.moveTo(ex + 4, ey - 4);
        ctx.lineTo(ex - 4, ey + 4);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(ex, ey, 6.2, 7, side * 0.25, 0, TAU);
      ctx.fill();
      const look = clamp(this.vx / 560, -1, 1);
      const px = ex + look * 2 + side * 0.6;
      const py = ey - 1.2;
      ctx.fillStyle = "#1a3d8f";
      ctx.beginPath();
      ctx.ellipse(px, py, 3.8, 4.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#0a1738";
      ctx.beginPath();
      ctx.ellipse(px, py + 0.5, 2.2, 2.8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(px - 1.4, py - 1.8, 1.5, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 1.2, py + 1.4, 0.7, 0, TAU);
      ctx.fill();
      // upper lid line (gives determination)
      ctx.strokeStyle = "rgba(6,70,100,0.6)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ex, ey - 0.5, 6.4, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      // blush
      ctx.fillStyle = "rgba(255,120,160,0.45)";
      ctx.beginPath();
      ctx.ellipse(side * 15, -18, 3, 1.8, 0, 0, TAU);
      ctx.fill();
    };
    drawEye(-1);
    drawEye(1);

    // ---- MOUTH / SNOUT ----
    ctx.strokeStyle = "rgba(6,60,90,0.6)";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (this.dead) {
      ctx.moveTo(-4, -37);
      ctx.lineTo(4, -37);
    } else {
      const grin = 2.5 + this.boostGlow * 2;
      ctx.moveTo(-5, -38);
      ctx.quadraticCurveTo(0, -38 + grin, 5, -38);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, -41, 3.5, 2, 0, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}
