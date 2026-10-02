import { BoxGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, TorusGeometry, Vector2, Vector3 } from './procedural/index.js';
import { MeshBuilder, compose, between } from './geometry.js';
import { getMaterial } from './materials.js';
import { createRng } from './rng.js';
import { fbm } from './noise.js';

/** Overall chickee dimensions in metres. */
export const CHICKEE = Object.freeze({
  width: 4.4, // along the ridge (x)
  depth: 3.0, // across the ridge (z)
  eaveHeight: 2.25, // top of the posts / eave plates
  ridgeHeight: 3.75,
  platformHeight: 0.8,
  overhang: 0.65, // thatch beyond the eave plates
  gableOverhang: 0.45, // thatch beyond the end rafters
  thatchThickness: 0.24,
  thatchCourses: 4,
});

function mesh(geometry, material, name, { cast = true, receive = true } = {}) {
  const m = new Mesh(geometry, typeof material === 'string' ? getMaterial(material) : material);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** A slightly irregular, tapering cypress log standing on y = 0. */
function postGeometry(rng, height, radius) {
  const profile = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    profile.push(new Vector2(radius * (1.08 - 0.18 * t) * (0.96 + rng() * 0.08), t * height));
  }
  const geometry = new LatheGeometry(profile, 9);
  // Natural logs are never perfectly straight.
  const bendX = (rng() - 0.5) * 0.06;
  const bendZ = (rng() - 0.5) * 0.06;
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height;
    const s = Math.sin(t * Math.PI);
    pos.setX(i, pos.getX(i) + bendX * s);
    pos.setZ(i, pos.getZ(i) + bendZ * s);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * One slope of thatch in its own frame: x along the ridge, y out of the
 * roof (thickness), z down the slope. Built from overlapping courses with
 * frayed lower edges, so the roof reads as layered palmetto thatch with real
 * thickness rather than a flat plane.
 */
function thatchSlopeGeometry(slopeLength, seed) {
  const { width, gableOverhang, thatchThickness, thatchCourses } = CHICKEE;
  const length = width + gableOverhang * 2;
  const builder = new MeshBuilder();
  const courseWidth = (slopeLength / thatchCourses) * 1.45;
  for (let c = 0; c < thatchCourses; c++) {
    const box = new BoxGeometry(length, thatchThickness, courseWidth, 48, 1, 2);
    const pos = box.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (z > courseWidth * 0.49) {
        // Frayed, uneven drip edge: frond tips of varying length.
        const n = fbm(x * 3 + c * 11, c * 5, { octaves: 3, seed: seed + c });
        const tips = Math.abs(Math.sin(x * 23 + c)) * 0.05;
        pos.setZ(i, z + (n - 0.5) * 0.22 + tips);
        pos.setY(i, pos.getY(i) - 0.03);
      }
      // Slight sag between rafters.
      pos.setY(i, pos.getY(i) - Math.abs(Math.sin((x / length) * Math.PI * 7)) * 0.025);
    }
    box.computeVertexNormals();
    const zCenter = (c + 0.5) * (slopeLength / thatchCourses) - courseWidth * 0.12;
    // Each lower course sits a little further out, like shingles.
    builder.addGeometry(box, compose([0, thatchThickness / 2 + c * 0.05, zCenter]));
  }
  return builder.build();
}

/**
 * A chickee: the open-sided, palmetto-thatched shelter used by the Seminole.
 * Six cypress posts carry eave plates, tie beams and a ridge pole; rafters
 * and purlins hold a thick, layered gable roof of thatch. A raised floor of
 * split logs sits on sills lashed to the posts.
 *
 * Child groups: `posts`, `platform`, `frame`, `roof` (with `thatchNorth`,
 * `thatchSouth` and `ridgeCap`).
 */
export function createChickee(seed = 31) {
  const rng = createRng(seed);
  const { width, depth, eaveHeight, ridgeHeight, platformHeight, overhang, gableOverhang } = CHICKEE;
  const chickee = new Group();
  chickee.name = 'chickee';
  const hw = width / 2;
  const hd = depth / 2;
  const postXs = [-hw, 0, hw];

  // Posts.
  const posts = new Group();
  posts.name = 'posts';
  let index = 0;
  for (const x of postXs) {
    for (const z of [-hd, hd]) {
      const post = mesh(postGeometry(rng, eaveHeight + 0.12, 0.1), 'log', `post${index++}`);
      post.position.set(x, -0.1, z);
      posts.add(post);
    }
  }
  chickee.add(posts);

  // Raised platform: sills lashed inside the posts, cross joists and a deck
  // of split cypress boards.
  const platform = new Group();
  platform.name = 'platform';
  const sills = new MeshBuilder();
  for (const z of [-hd + 0.12, hd - 0.12]) {
    sills.addGeometry(new CylinderGeometry(0.075, 0.075, 1, 8), between(new Vector3(-hw - 0.15, platformHeight - 0.12, z), new Vector3(hw + 0.15, platformHeight - 0.1, z)));
  }
  for (const x of postXs) {
    sills.addGeometry(new CylinderGeometry(0.06, 0.06, 1, 8), between(new Vector3(x, platformHeight - 0.2, -hd - 0.1), new Vector3(x, platformHeight - 0.2, hd + 0.1)));
  }
  platform.add(mesh(sills.build(), 'log', 'sills'));

  const deck = new MeshBuilder();
  let x = -hw + 0.12;
  while (x < hw - 0.1) {
    const w = 0.15 + rng() * 0.06;
    deck.addGeometry(
      new BoxGeometry(w - 0.012, 0.055, depth - 0.12),
      compose([x + w / 2, platformHeight - 0.01 + rng() * 0.012, (rng() - 0.5) * 0.04], [0, (rng() - 0.5) * 0.02, (rng() - 0.5) * 0.04]),
    );
    x += w;
  }
  const floor = mesh(deck.build(), 'wood', 'floor');
  platform.add(floor);
  chickee.add(platform);

  // Roof frame: eave plates, tie beams, king posts, ridge, rafters, purlins.
  const frame = new MeshBuilder();
  const pole = (a, b, r) => frame.addGeometry(new CylinderGeometry(r * 0.85, r, 1, 7), between(a, b));
  const plateY = eaveHeight + 0.02;
  for (const z of [-hd, hd]) pole(new Vector3(-hw - 0.3, plateY, z), new Vector3(hw + 0.3, plateY, z), 0.07);
  for (const px of postXs) {
    pole(new Vector3(px, plateY + 0.1, -hd - 0.2), new Vector3(px, plateY + 0.1, hd + 0.2), 0.065);
    pole(new Vector3(px, plateY + 0.1, 0), new Vector3(px, ridgeHeight, 0), 0.06);
  }
  pole(new Vector3(-hw - gableOverhang, ridgeHeight, 0), new Vector3(hw + gableOverhang, ridgeHeight, 0), 0.075);

  const run = hd + overhang;
  const pitch = Math.atan2(ridgeHeight - eaveHeight, hd);
  const eaveDrop = run * Math.tan(pitch);
  const rafterCount = 9;
  for (let i = 0; i < rafterCount; i++) {
    const rx = -hw - 0.2 + (i / (rafterCount - 1)) * (width + 0.4);
    for (const side of [-1, 1]) {
      pole(new Vector3(rx, ridgeHeight + 0.05, 0), new Vector3(rx, ridgeHeight - eaveDrop, side * run), 0.04);
    }
  }
  for (let p = 1; p <= 3; p++) {
    const t = p / 4;
    for (const side of [-1, 1]) {
      const y = ridgeHeight - eaveDrop * t + 0.06;
      pole(new Vector3(-hw - 0.3, y, side * run * t), new Vector3(hw + 0.3, y, side * run * t), 0.03);
    }
  }
  const frameMesh = mesh(frame.build(), 'pole', 'frame');

  // Palm-fibre lashings where the beams meet the posts.
  const lashings = new MeshBuilder();
  for (const px of postXs) {
    for (const z of [-hd, hd]) {
      for (const y of [plateY, platformHeight - 0.12]) {
        lashings.addGeometry(new TorusGeometry(0.11, 0.022, 5, 10), compose([px, y, z], [Math.PI / 2, 0, 0], [1, 1, 1.6]));
      }
    }
  }
  const frameGroup = new Group();
  frameGroup.name = 'frame';
  frameGroup.add(frameMesh, mesh(lashings.build(), 'thatchDark', 'lashings'));
  chickee.add(frameGroup);

  // Thatch: two thick, layered slopes plus a rounded ridge cap held down by
  // crossed poles.
  const roof = new Group();
  roof.name = 'roof';
  const slopeLength = Math.hypot(run, eaveDrop) + 0.1;
  for (const side of [-1, 1]) {
    const slope = mesh(thatchSlopeGeometry(slopeLength, side > 0 ? 3 : 17), 'thatch', side > 0 ? 'thatchSouth' : 'thatchNorth');
    slope.position.set(0, ridgeHeight + 0.08, 0);
    // Local +z runs down the slope on this side.
    slope.rotation.set(side * pitch, side > 0 ? 0 : Math.PI, 0);
    roof.add(slope);
  }
  const cap = new CylinderGeometry(0.3, 0.3, width + gableOverhang * 2 + 0.1, 12, 1);
  cap.rotateZ(Math.PI / 2);
  cap.scale(1, 0.62, 1);
  const ridgeCap = mesh(cap, 'thatchDark', 'ridgeCap');
  ridgeCap.position.y = ridgeHeight + 0.3;
  roof.add(ridgeCap);
  const ridgePoles = new MeshBuilder();
  for (let i = 0; i < 5; i++) {
    const px = -hw + (i / 4) * width;
    for (const lean of [-1, 1]) {
      ridgePoles.addGeometry(
        new CylinderGeometry(0.03, 0.035, 1, 6),
        between(new Vector3(px + lean * 0.12, ridgeHeight + 0.05, -0.75), new Vector3(px - lean * 0.12, ridgeHeight + 0.75, 0.55)),
      );
    }
  }
  roof.add(mesh(ridgePoles.build(), 'pole', 'ridgePoles'));
  chickee.add(roof);

  // Belongings on the platform: a rolled sleeping mat and folded blankets.
  const belongings = new Group();
  belongings.name = 'belongings';
  const mat = mesh(new CylinderGeometry(0.16, 0.16, 1.4, 14), 'basket', 'sleepingMat');
  mat.rotation.z = Math.PI / 2;
  mat.position.set(-0.9, platformHeight + 0.18, -0.9);
  const blanket = mesh(new BoxGeometry(0.9, 0.18, 0.6, 4, 2, 4), 'blanket', 'blankets');
  blanket.position.set(1.0, platformHeight + 0.1, -0.7);
  blanket.rotation.y = 0.2;
  const blanket2 = mesh(new BoxGeometry(0.8, 0.1, 0.5), 'blanketBlue', 'blanketsTop');
  blanket2.position.set(1.0, platformHeight + 0.24, -0.72);
  blanket2.rotation.y = 0.05;
  belongings.add(mat, blanket, blanket2);
  chickee.add(belongings);

  chickee.userData = {
    roofThickness: CHICKEE.thatchThickness,
    interactive: { label: 'Chickee', prompt: 'A family chickee: cypress posts, raised floor and palmetto thatch' },
  };
  return chickee;
}
