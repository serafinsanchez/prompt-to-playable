import { NodeIO } from "@gltf-transform/core";
const io = new NodeIO();
const rig = await io.read("spike-output/rig.glb");
const rigNodes = new Set(rig.getRoot().listNodes().map((n) => n.getName()));
console.log(`rig nodes: ${rigNodes.size}`);
for (const clip of ["idle", "walk", "run", "jump", "emote"]) {
  const doc = await io.read(`spike-output/animate-${clip}.glb`);
  const anims = doc.getRoot().listAnimations();
  for (const anim of anims) {
    const targets = new Set(anim.listChannels().map((c) => c.getTargetNode()?.getName() ?? "?"));
    const missing = [...targets].filter((t) => !rigNodes.has(t));
    console.log(
      `${clip}: "${anim.getName()}" channels=${anim.listChannels().length} targets=${targets.size} missingInRig=${missing.length}${missing.length ? " -> " + missing.slice(0, 5).join(",") : ""}`,
    );
  }
  if (anims.length === 0) console.log(`${clip}: NO ANIMATIONS IN GLB`);
}
