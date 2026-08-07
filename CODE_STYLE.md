# Code style & comment guidelines

This describes the style and commenting conventions used in BlockBuilder.

## Philosophy

**Comments explain WHY, not WHAT.** Code should be self-documenting through clear naming;
comments explain design decisions, constraints, and non-obvious behavior.

❌ **Bad comment (what):**
```ts
// Loop through cells
for (let y = 0; y < grid.height; y++) {
```

✅ **Good comment (why):**
```ts
// Row 0 is the top of the group in the on-screen picker, but world +Y is "up" — so increasing
// row must SUBTRACT from the Y offset, not add to it, or the curve ends up mirrored.
for (let y = 0; y < grid.height; y++) {
```

## Function documentation

**Exported functions** get a comment describing their purpose and any non-obvious constraints —
especially *why* a particular approach was chosen over an apparently simpler one:

```ts
/**
 * Walks outward from a cell along (dx, dy), one grid step at a time, collecting a translated
 * clone of `box` for every consecutive hollowed CircleSolid ring cell whose shared edge with the
 * previous step is still inside the ring's own hollow radius — i.e. every cell along the way that
 * would otherwise face empty air instead of real material.
 */
function collectJoinBridges(...): THREE.BufferGeometry[] {
```

**Private/internal functions** only need comments if they're complex or have non-obvious
constraints.

## Inline comments

**Use sparingly.** Only when the logic itself is non-obvious, or when a value/approach looks
like it should be simpler than it is:

```ts
// A tiny outward nudge on the shared circle's radius — several (dimension, col, row)
// combinations land the inner/outer radius EXACTLY on a shared corner between two cells, the
// known degenerate tangent case for this project's CSG engine. Nudging by a fraction of a
// millimetre turns an exact touch into a clean "just inside" instead.
const RADIUS_EPSILON = 0.02;
```

Don't explain what the code does when the code is already clear:

```ts
// ❌ Bad — the code is already clear
i++; // increment i

// ✅ If needed, explain why
i++; // skip the run's start cell — it's already covered by the previous fused segment
```

## TypeScript / React style

- **Function names:** camelCase. **Component names:** PascalCase.
- **Types over `any`** — the project builds with `strict: true`, `noUnusedLocals`, and
  `noUnusedParameters`; keep it that way.
- **Comments explain hooks, state, or non-obvious prop drilling:**
  ```tsx
  // Debounced so a paint drag (many grid updates a second) doesn't rebuild the full CSG geometry
  // on every single cell change — only once the user pauses.
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  ```
- **No JSDoc on components** unless the logic is particularly tricky — prop types are already
  visible via TypeScript/React DevTools.

## Files that need comments

Add comments to:
- **Geometry-building functions** (`src/model/geometry.ts`, `circleSolidGeometry.ts`, etc.) —
  especially anything that works around a CSG engine quirk or degenerate case.
- **Non-obvious coordinate/axis conventions** — see [`COORDINATE_SYSTEM.md`](COORDINATE_SYSTEM.md)
  for the project-wide reference; call out anywhere local code deviates from or interacts subtly
  with it.
- **Workarounds for a specific bug** — explain the bug and why the fix works, not just what
  changed.

## When NOT to comment

- Variable names that are already clear (`cellHeight`, `layerBase`)
- Loop bodies that are self-evident
- Standard patterns (a plain `useState`/`useCallback` with no subtlety)

## Consistency checks

Before committing:

- [ ] Exported functions have a comment explaining their purpose and any non-obvious constraints?
- [ ] Complex logic has an inline comment explaining WHY it's done that way?
- [ ] No commented-out code blocks? (use git history if you need old code)
- [ ] `npm run typecheck` passes with no errors?

## Questions?

If you're unsure whether something needs a comment, imagine explaining it to a smart colleague who
hasn't seen the code:
- **Yes, they'd need context** → add a comment
- **The code is already obvious** → don't comment it

---

That's it. Good comments make code easy to maintain. Bad comments make it harder. When in doubt,
leave it out.
