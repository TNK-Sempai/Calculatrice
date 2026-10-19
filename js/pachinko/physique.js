// =====================================================================
//  PHYSIQUE DES BILLES - partagee par le Pachinko et le flipper Matsuri
//  Une bille est un cercle { x, y, vx, vy, r }. Les obstacles sont des
//  segments (murs, rails, flippers) et des cercles (clous, bumpers).
//  Chaque collision repousse la bille hors de l'obstacle puis reflechit
//  la composante normale de sa vitesse avec un coefficient de restitution.
//  Les jeux appellent ces fonctions dans des sous-pas fixes : avec un pas
//  assez petit, une bille rapide ne peut pas traverser un mur fin.
// =====================================================================

function borner(valeur, min, max) {
  return valeur < min ? min : valeur > max ? max : valeur;
}

// Point du segment [a, b] le plus proche de (x, y)
export function pointLePlusProche(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const longueur2 = dx * dx + dy * dy;
  const t = longueur2 === 0 ? 0 : borner(((x - ax) * dx + (y - ay) * dy) / longueur2, 0, 1);
  return { x: ax + t * dx, y: ay + t * dy, t };
}

// Renvoie la normale de contact { nx, ny, vn } si la bille a touche, sinon null.
// epaisseur : demi-epaisseur du segment (un flipper est plus gros qu'un rail).
// vitesseSurface : vitesse de l'obstacle au point de contact (flipper qui frappe).
export function rebondSegment(bille, ax, ay, bx, by, restitution, epaisseur, vitesseSurface) {
  const p = pointLePlusProche(bille.x, bille.y, ax, ay, bx, by);
  let nx = bille.x - p.x;
  let ny = bille.y - p.y;
  const distance = Math.hypot(nx, ny);
  const rayon = bille.r + (epaisseur || 0);
  if (distance >= rayon) {
    return null;
  }
  if (distance < 1e-6) {
    // Bille pile sur le segment : on la pousse selon la normale du segment
    nx = -(by - ay);
    ny = bx - ax;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
  } else {
    nx /= distance;
    ny /= distance;
  }
  bille.x = p.x + nx * rayon;
  bille.y = p.y + ny * rayon;

  const sx = vitesseSurface ? vitesseSurface.x : 0;
  const sy = vitesseSurface ? vitesseSurface.y : 0;
  const rx = bille.vx - sx;
  const ry = bille.vy - sy;
  const vn = rx * nx + ry * ny;
  if (vn < 0) {
    bille.vx = rx - (1 + restitution) * vn * nx + sx;
    bille.vy = ry - (1 + restitution) * vn * ny + sy;
  }
  return { nx, ny, vn, t: p.t, px: p.x, py: p.y };
}

export function rebondCercle(bille, cx, cy, rayonObstacle, restitution) {
  let nx = bille.x - cx;
  let ny = bille.y - cy;
  const distance = Math.hypot(nx, ny);
  const rayon = bille.r + rayonObstacle;
  if (distance >= rayon) {
    return null;
  }
  if (distance < 1e-6) {
    nx = 0;
    ny = -1;
  } else {
    nx /= distance;
    ny /= distance;
  }
  bille.x = cx + nx * rayon;
  bille.y = cy + ny * rayon;
  const vn = bille.vx * nx + bille.vy * ny;
  if (vn < 0) {
    bille.vx -= (1 + restitution) * vn * nx;
    bille.vy -= (1 + restitution) * vn * ny;
  }
  return { nx, ny, vn };
}

// Deux billes qui se touchent echangent leur quantite de mouvement normale
export function chocBilles(a, b, restitution) {
  let nx = b.x - a.x;
  let ny = b.y - a.y;
  const distance = Math.hypot(nx, ny);
  const rayon = a.r + b.r;
  if (distance >= rayon || distance < 1e-6) {
    return false;
  }
  nx /= distance;
  ny /= distance;
  const recouvrement = (rayon - distance) / 2;
  a.x -= nx * recouvrement;
  a.y -= ny * recouvrement;
  b.x += nx * recouvrement;
  b.y += ny * recouvrement;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn < 0) {
    const j = -(1 + restitution) * vn / 2;
    a.vx -= j * nx;
    a.vy -= j * ny;
    b.vx += j * nx;
    b.vy += j * ny;
  }
  return true;
}

// Plafond de vitesse : la garantie ultime contre les billes qui traversent
export function plafonner(bille, max) {
  const v = Math.hypot(bille.vx, bille.vy);
  if (v > max) {
    bille.vx *= max / v;
    bille.vy *= max / v;
  }
}

// Une polyligne [[x, y], ...] devient une liste de segments
export function segmentsDe(points, ferme) {
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push([points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]]);
  }
  if (ferme) {
    const a = points[points.length - 1];
    segments.push([a[0], a[1], points[0][0], points[0][1]]);
  }
  return segments;
}

// Un arc de cercle approche par des segments
export function arc(cx, cy, r, debut, fin, pas) {
  const points = [];
  const n = Math.max(2, Math.ceil(Math.abs(fin - debut) / (pas || 0.12)));
  for (let i = 0; i <= n; i++) {
    const a = debut + (fin - debut) * (i / n);
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return points;
}
