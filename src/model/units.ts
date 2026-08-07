// Technic-compatible dimensional constants, all in millimetres.
// Sources: the standard stud pitch (8mm), and real Technic-style connector geometry given relative to
// an 8mm module unit; the mm values below are that ratio scaled back out (e.g. pinHoleRadius =
// 2.475/8 * 8 = 2.475mm).

export const STUD_PITCH = 8;
export const PLATE_HEIGHT = 3.2;
export const BRICK_HEIGHT = PLATE_HEIGHT * 3; // 9.6mm

// A Technic beam/liftarm is one MODULE tall — the same 8mm as the stud pitch — which makes its
// cross-section SQUARE. That squareness is what lets a real beam's rounded end sit flush against
// its own flat top and bottom faces: the end cap's radius is half the block minus a hairline
// margin (see rounding.ts's CELL_EDGE_RADIUS, 3.8mm), which is tangent to a 4.0mm half-height but
// leaves a visible 1mm ledge against a System brick's 4.8mm half-height. Every Technic block is
// built as an 8mm cube for exactly this reason. Prefer this over BRICK_HEIGHT for Technic parts;
// BRICK_HEIGHT stays correct for System-style bricks/plates.
export const TECHNIC_MODULE_HEIGHT = STUD_PITCH; // 8mm
export const TECHNIC_HALF_MODULE_HEIGHT = TECHNIC_MODULE_HEIGHT / 2; // 4mm — a thin "x 0.5" liftarm

export const STUD_RADIUS = 2.4;
export const STUD_HEIGHT = 1.7;

// Technic pin-hole (round beam hole) bore, sized for a standard Technic pin friction fit. This is
// the real part's own hole radius (2.475/8 * an 8mm module unit) exactly, not fudged for printing —
// see PRINT_HOLE_CLEARANCE_DEFAULT below for where print-tolerance compensation actually lives.
// An earlier version of this file added a fixed extra radius directly into this constant, which
// quietly made every hole dimension diverge from the real part's own reference numbers by default —
// wrong for anyone actually comparing/checking parts against the reference dimensions. Print
// clearance is now a separate, visible, per-project GridState.holeClearance setting (default 0, so
// a fresh project matches the reference exactly) threaded through at geometry-build time in
// primitives.ts instead of baked into "the" dimension.
export const PIN_HOLE_RADIUS = 2.475;
// A reasonable starting value for GridState.holeClearance on a NEW project (see its own doc in
// grid.ts) — not applied automatically to this or any other constant here. 0.15mm was reported too
// tight on an Anycubic S1; the real part's own injection-molded tolerance (PIN_HOLE_RADIUS 2.475 vs
// PIN_SHAFT_RADIUS 2.315 = 0.16mm radial) assumes far more precision than a desktop printer
// reliably reproduces, and printed holes in particular tend to come out undersized (shrinkage,
// perimeter-overlap/"elephant's foot"-style effects).
export const PRINT_HOLE_CLEARANCE_DEFAULT = 0.15;
// A reasonable starting value for GridState.sidewaysHoleClearance — extra radius for x/y (i.e.
// horizontal-on-the-bed) bores only, on top of whatever holeClearance is set to. 0.1mm radius is
// 0.2mm on diameter, matching the usual published rule of thumb for how much an FFF-printed
// horizontal hole comes out under nominal. Very printer-dependent; measure a test piece.
export const PRINT_SIDEWAYS_HOLE_CLEARANCE_DEFAULT = 0.1;
// Ring around a pin hole that's thicker than the surrounding wall, matching real Technic beams —
// the boss/interior wall radius around any round hole.
export const PIN_HOLE_BOSS_RADIUS = 3.2;
// How far in from each face the hole's wider entrance chamfer (see pinHoleBrush) extends. This is
// what gives a Technic hole its distinctive wider-mouth-both-ends profile that guides a pin in and
// grips at the narrower middle.
export const PIN_HOLE_CHAMFER_DEPTH = 0.89;

// The friction pin's own shaft radius/lip radius. The real part is solid with small friction
// ribs (no printable-flex slit — that undersized-shaft-plus-ribs scheme was our own invention for
// FDM printing and is kept, but sized off the real part now).
export const PIN_SHAFT_RADIUS = 2.315;
export const PIN_LIP_RADIUS = 0.17;

// A real full-length friction pin carries a raised collar around its MIDDLE. It's not
// decorative: a Technic hole is countersunk at each mouth — a wider recess of PIN_HOLE_BOSS_RADIUS
// running PIN_HOLE_CHAMFER_DEPTH deep before the bore narrows — and the collar drops into that
// recess. With two beams butted together, the collar occupies both facing counterbores at once,
// which is what centres the pin across the joint and stops it sliding through.
//
// Radius is the real part's own collar radius (3mm), comfortably inside the 3.2mm counterbore it
// seats in while standing proud of the 2.315mm shaft. The width spans the two facing counterbores
// it bridges.
export const PIN_COLLAR_RADIUS = 3.0;
export const PIN_COLLAR_WIDTH = PIN_HOLE_CHAMFER_DEPTH * 2; // 1.78mm
// A pin fused from 3+ PinPiece cells gets a collar at EVERY internal stud-pitch boundary it
// passes (see PinOptions.collars), not one at its own geometric centre — matching a real longer
// pin's own hole-junction spacing rather than an arbitrary midpoint. With several collars along
// one shaft rather than the usual single one, each is reduced to about half its normal protrusion
// above the shaft — judgement rather than a measured reference figure (no verified real dimension
// for a 3+-module pin's own collar height was available), but it keeps a longer pin from reading
// as a row of full-size collar discs, which no real reference part shows.
export const PIN_COLLAR_RADIUS_REDUCED = PIN_SHAFT_RADIUS + (PIN_COLLAR_RADIUS - PIN_SHAFT_RADIUS) * 0.5;
// The counterbore does NOT step straight in to the bore. That step would be a flat ring
// perpendicular to the bore — a 90° overhang, printed out over the counterbore's own void — and on
// a vertical (z) bore it's the first thing the printer meets going up: unsupported filament that
// droops and doesn't bond. Replaced with a 45° cone, the steepest angle FFF reliably self-supports.
//
// The cone runs the full radial gap (PIN_HOLE_BOSS_RADIUS down to the bore radius) and, being 45°,
// travels the same distance along the bore as it does radially. Crucially the straight part of the
// counterbore is SHORTENED by exactly this setback to compensate, so the depth at which the cone
// passes the collar's own radius — i.e. where a pin's collar actually comes to rest — still lands
// at exactly PIN_HOLE_CHAMFER_DEPTH. Assembled fit is unchanged; only the unprintable corner is
// gone. The setback works out the same whatever hole clearance is dialled in, since at 45° the
// radius drops 1mm per 1mm of depth regardless of where the cone ends.
export const PIN_HOLE_COLLAR_SEAT_SETBACK = PIN_HOLE_BOSS_RADIUS - PIN_COLLAR_RADIUS;

// Cross-shaped axle hole: the arm half-width; the cross is inscribed in (clipped to) a circle of
// PIN_HOLE_RADIUS, matching the real part — NOT the wider boss radius, which only applies to
// round Technic/Stud holes.
export const AXLE_ARM_WIDTH = 1.01;
export const AXLE_ARM_LENGTH = PIN_HOLE_RADIUS;

// The printed Technic axle ROD itself (not the hole it fits into) — its own inner/outer arm
// dimensions. Deliberately smaller than the hole's own cross dimensions above for clearance, the
// same way PIN_SHAFT_RADIUS sits under PIN_HOLE_RADIUS.
export const AXLE_ROD_ARM_WIDTH = 0.86;
export const AXLE_ROD_ARM_LENGTH = 2.15;

// Ball-joint connector — the real part's own ball/ball-base radius.
export const BALL_JOINT_RADIUS = 3.0;
export const BALL_PIN_NECK_RADIUS = 1.6;
// The socket's entry channel narrows just enough (a small lip) to retain the ball, not down to
// the neck's own width — an earlier version of this constant (BALL_PIN_NECK_RADIUS + 0.2 = 1.8mm)
// made the *opening* (3.6mm diameter) smaller than the ball itself (6.0mm diameter), which isn't
// a tight fit, it's a geometric impossibility: no amount of flex gets a rigid sphere through a
// hole smaller than its own diameter.
//
// This 0.2mm radial engagement (down from an intermediate 0.35mm attempt) was chosen by checking
// it's actually survivable to flex, not just non-impossible: the prong that has to spring past this
// engagement is now the real fork geometry below (BALL_SOCKET_FORK_*) — a genuinely thin, open cap,
// not a thin blade between saw-cuts, which is a strictly easier bending problem than the 14.6%
// strain the original 0.35mm/thin-slot design came out to; 0.2mm keeps that same comfortable margin.
export const BALL_JOINT_CHANNEL_RADIUS = BALL_JOINT_RADIUS - 0.2;
// A rigid printed collar that size still won't spring open on its own. The real part doesn't solve
// this with a slotted collar at all — checked directly against the actual real parts' own geometry
// (BrickLink's own name for them is "Angled Forks ... Open Sides"), and that's literal — the
// socket is a U/fork shape, two curved prongs (top and bottom) that are
// each naturally thin and flexible because there's genuinely open air on every other side of them,
// not a solid ring with relief cuts. An earlier version here cut 3 thin radial slits into an
// intact collar instead, which flexes by concentrating bend into the slot ROOT — a stress-riser
// that's a materially worse way to get the same motion than a part that's just thin where it needs
// to be, the way the real fork is.
//
// BALL_SOCKET_FORK_OPEN_HALF_WIDTH is the gap's own half-width splitting the two prongs (top vs
// bottom) — kept comfortably under BALL_JOINT_CHANNEL_RADIUS so each prong's own inner edge still
// reaches in far enough to form the retention lip the channel radius cuts (i.e. this doesn't
// change what retains the ball, only how much material surrounds the retaining edge).
// BALL_SOCKET_FORK_PRONG_HALF_WIDTH bounds each prong the OTHER way too (left-right), well short of
// the cell's own STUD_PITCH/2 wall — without this bound the prongs would still span the cell's
// full width and only the top-to-bottom slot would be open, not the sides. BALL_SOCKET_FORK_DEPTH
// is how far each prong reaches in from the port face — close to BALL_JOINT_RADIUS so the fork
// just wraps past the ball's own equator (where it's widest, and so where retention must clamp)
// rather than only nibbling the mouth of the socket, but comfortably under half a standard 8mm
// cell (4mm) so there's still real solid backing behind the fork, not the fork spanning the
// cell's entire depth.
export const BALL_SOCKET_FORK_OPEN_HALF_WIDTH = 1.5;
export const BALL_SOCKET_FORK_PRONG_HALF_WIDTH = 3.0;
export const BALL_SOCKET_FORK_DEPTH = 3.2;

// A second, simpler hole type for a standard System-style stud (not a Technic pin): a plain
// uniform-radius through-hole, no wider entrance chamfer — a System stud doesn't need guiding
// in from both sides the way a Technic pin does.
export const STUD_HOLE_RADIUS = 2.5;

// Small clearance so CSG subtraction cleanly pierces through walls instead of leaving a
// coplanar (numerically unstable) face at the boundary.
export const CUT_EPSILON = 0.5;

// Adjacent cell boxes/studs are given a tiny amount of *overlap* (rather than sitting exactly
// flush/coplanar) before being merged into one body. three-bvh-csg (and mesh boolean libraries
// generally) are numerically unstable on exactly-touching, non-overlapping geometry — the
// symptom is missing chunks/holes in the merged result. A fraction-of-a-millimetre overlap is
// invisible in the final part but keeps every merge/boolean well inside "actually overlapping"
// territory.
export const CELL_OVERLAP = 0.1;
export const STUD_OVERLAP = 0.15;
